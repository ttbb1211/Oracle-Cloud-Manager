import { createHash, createPublicKey } from 'crypto'
import BaseComputeProvider from './BaseComputeProvider.mjs'
import { validateOracleInstancePassword } from '../../utils/oraclePassword.mjs'

let ociSdkPromise = null

async function loadOciSdk() {
  if (!ociSdkPromise) {
    ociSdkPromise = import('oci-sdk').then((mod) => mod.default || mod)
  }
  return ociSdkPromise
}

export default class OracleProvider extends BaseComputeProvider {
  static providerName = 'oracle'
  static capabilities = ['switch_ip', 'ipv6', 'modify_config', 'list_boot_volumes', 'delete_boot_volume', 'create_network', 'allow_all_inbound_traffic']

  constructor(account) {
    super(account)
    const creds = account.credentials || {}

    this.configText = creds.configText || account.configText
    this.rawPrivateKeyText = creds.privateKeyText || account.privateKeyText
    this.profile = creds.profile || creds.configProfile || account.configProfile || 'DEFAULT'

    this.provider = null
    this.compartmentId = null
    this.computeClient = null
    this.networkClient = null
    this.blockClient = null
    this.identityClient = null
    this._initPromise = null
    this._availabilityDomains = []
  }

  async _ensureInitialized() {
    if (this._initPromise) {
      await this._initPromise
      return
    }

    this._initPromise = (async () => {
      const sdk = await loadOciSdk()
      const { SimpleAuthenticationDetailsProvider, common, core, identity } = sdk

      const config = this._parseOciConfig(this.configText, this.profile)
      const privateKeyText = this._resolvePrivateKeyText(this.rawPrivateKeyText)
      this._assertFingerprintMatches(config.fingerprint, privateKeyText)

      this.provider = new SimpleAuthenticationDetailsProvider(
        config.tenancy,
        config.user,
        config.fingerprint,
        privateKeyText,
        config.pass_phrase || null,
        common.Region.fromRegionId(config.region)
      )
      this.compartmentId = config.tenancy

      this.computeClient = new core.ComputeClient({ authenticationDetailsProvider: this.provider })
      this.networkClient = new core.VirtualNetworkClient({ authenticationDetailsProvider: this.provider })
      this.blockClient = new core.BlockstorageClient({ authenticationDetailsProvider: this.provider })
      this.identityClient = new identity.IdentityClient({ authenticationDetailsProvider: this.provider })
    })()

    try {
      await this._initPromise
    } catch (err) {
      this._initPromise = null
      throw err
    }
  }

  _parseOciConfig(text, profile) {
    if (!text) {
      throw new Error('Oracle Config 缺失')
    }

    const config = {}
    let currentProfile = null
    for (let line of text.split('\n')) {
      line = line.trim()
      if (!line || line.startsWith('#') || line.startsWith(';')) continue
      const profileMatch = line.match(/^\[(.*)\]$/)
      if (profileMatch) {
        currentProfile = profileMatch[1].trim()
        continue
      }
      if (currentProfile === profile) {
        const idx = line.indexOf('=')
        if (idx !== -1) {
          config[line.substring(0, idx).trim()] = line.substring(idx + 1).trim()
        }
      }
    }

    if (!config.user || !config.tenancy || !config.fingerprint || !config.region) {
      throw new Error('Oracle Config 解析失败：未找到有效凭证')
    }

    return config
  }

  _serializeOciConfig(config, profile = this.profile) {
    const orderedKeys = ['user', 'fingerprint', 'tenancy', 'region', 'key_file', 'pass_phrase']
    const lines = [`[${profile}]`]

    for (const key of orderedKeys) {
      if (config[key]) {
        lines.push(`${key}=${config[key]}`)
      }
    }

    for (const [key, value] of Object.entries(config)) {
      if (!orderedKeys.includes(key) && value != null && value !== '') {
        lines.push(`${key}=${value}`)
      }
    }

    return `${lines.join('\n')}\n`
  }

  _buildConfigTextForRegion(region) {
    const config = this._parseOciConfig(this.configText, this.profile)
    config.region = region
    return this._serializeOciConfig(config, this.profile)
  }

  _normalizePrivateKeyText(text) {
    if (!text) return text

    const normalized = String(text).replace(/\r\n/g, '\n').trim()
    const pemMatch = normalized.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/)
    if (pemMatch) return pemMatch[0]

    const rsaPemMatch = normalized.match(/-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/)
    if (rsaPemMatch) return rsaPemMatch[0]

    return normalized
  }

  _resolvePrivateKeyText(privateKeyText) {
    const normalized = this._normalizePrivateKeyText(privateKeyText)
    if (normalized) return normalized

    throw new Error('Oracle private key 缺失')
  }

  _assertFingerprintMatches(expectedFingerprint, privateKeyText) {
    if (!expectedFingerprint || !privateKeyText) return

    const publicKeyDer = createPublicKey(privateKeyText).export({ type: 'spki', format: 'der' })
    const actualFingerprint = createHash('md5')
      .update(publicKeyDer)
      .digest('hex')
      .match(/.{1,2}/g)
      .join(':')

    if (actualFingerprint !== expectedFingerprint.toLowerCase()) {
      throw new Error(`Oracle API Key 不匹配：config fingerprint=${expectedFingerprint}，private key fingerprint=${actualFingerprint}`)
    }
  }

  async listSubscribedRegions() {
    await this._ensureInitialized()
    const config = this._parseOciConfig(this.configText, this.profile)
    const response = await this.identityClient.listRegionSubscriptions({ tenancyId: config.tenancy })

    return (response.items || []).map((item) => ({
      regionKey: item.regionKey,
      regionName: item.regionName,
      regionCode: item.regionName,
      status: item.status,
      isHomeRegion: Boolean(item.isHomeRegion)
    }))
  }

  buildRegionAccountDrafts(baseName, regions = []) {
    if (!Array.isArray(regions) || !regions.length) {
      throw new Error('未提供可生成的 region 列表')
    }

    return regions.map((region) => {
      const regionCode = region.regionCode || region.regionName
      const regionLabel = region.regionKey || regionCode
      return {
        name: `${baseName} / ${regionLabel}`,
        computeProvider: 'oracle',
        enabled: true,
        credentials: {
          configText: this._buildConfigTextForRegion(regionCode),
          privateKeyText: this._normalizePrivateKeyText(this.rawPrivateKeyText),
          profile: this.profile,
          region: regionCode,
          regionKey: region.regionKey || '',
          regionName: region.regionName || regionCode,
          isHomeRegion: Boolean(region.isHomeRegion)
        }
      }
    })
  }

  async _getAvailabilityDomains() {
    await this._ensureInitialized()
    if (this._availabilityDomains.length) return this._availabilityDomains

    const res = await this.identityClient.listAvailabilityDomains({ compartmentId: this.compartmentId })
    this._availabilityDomains = res.items.map((item) => item.name)
    return this._availabilityDomains
  }

  async _getInstancePublicIps(instanceId) {
    await this._ensureInitialized()
    const vnics = await this.computeClient.listVnicAttachments({ compartmentId: this.compartmentId, instanceId })
    const publicIps = []
    const privateIps = []
    const ipv6s = []

    for (const vnic of vnics.items) {
      const vnicDetails = await this.networkClient.getVnic({ vnicId: vnic.vnicId })
      if (vnicDetails.vnic.publicIp) publicIps.push(vnicDetails.vnic.publicIp)
      if (vnicDetails.vnic.privateIp) privateIps.push(vnicDetails.vnic.privateIp)
      if (vnicDetails.vnic.ipv6Addresses?.length) ipv6s.push(...vnicDetails.vnic.ipv6Addresses)
    }

    return { publicIps, privateIps, ipv6s }
  }

  async listInstances() {
    await this._ensureInitialized()
    const res = await this.computeClient.listInstances({ compartmentId: this.compartmentId })
    const active = res.items.filter((item) => !['TERMINATED', 'TERMINATING'].includes(item.lifecycleState))

    return Promise.all(active.map(async (ins) => {
      let ips = { publicIps: [], privateIps: [], ipv6s: [] }
      try {
        ips = await this._getInstancePublicIps(ins.id)
      } catch (_) {
      }
      return OracleProvider.normalizeInstance(ins, ips)
    }))
  }

  async getInstance(instanceId) {
    await this._ensureInitialized()
    const res = await this.computeClient.getInstance({ instanceId })
    let ips = { publicIps: [], privateIps: [], ipv6s: [] }
    try {
      ips = await this._getInstancePublicIps(instanceId)
    } catch (_) {
    }
    return OracleProvider.normalizeInstance(res.instance, ips)
  }

  async createInstance(params) {
    await this._ensureInitialized()
    const { shape = 'VM.Standard.A1.Flex', ocpus = 1, memoryGb = 6, rootPassword } = params

    validateOracleInstancePassword(rootPassword)

    const ads = await this._getAvailabilityDomains()
    if (!ads.length) throw new Error('无法获取可用区')

    const imgRes = await this.computeClient.listImages({
      compartmentId: this.compartmentId,
      limit: 3,
      operatingSystem: 'Canonical Ubuntu',
      operatingSystemVersion: '24.04',
      shape,
      sortOrder: 'DESC',
      sortBy: 'TIMECREATED'
    })
    if (!imgRes.items.length) throw new Error('未找到可用镜像')
    const imageId = imgRes.items[0].id

    const subnetRes = await this.networkClient.listSubnets({ compartmentId: this.compartmentId })
    const subnetId = subnetRes.items.find((item) => !item.prohibitInternetIngress && !item.prohibitPublicIpOnVnic)?.id
    if (!subnetId) throw new Error('未找到可用公网子网，请先在 OCI 控制台创建')

    const ad = ads[Math.floor(Math.random() * ads.length)]
    const cloudInit = Buffer.from(`#cloud-config\nchpasswd:\n  list: |\n    root:${rootPassword}\n  expire: false\nssh_pwauth: true\nruncmd:\n  - sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/g' /etc/ssh/sshd_config\n  - sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/g' /etc/ssh/sshd_config\n  - systemctl restart sshd\n`).toString('base64')

    const details = {
      compartmentId: this.compartmentId,
      availabilityDomain: ad,
      imageId,
      subnetId,
      shape,
      metadata: { user_data: cloudInit },
      createVnicDetails: { assignPublicIp: true },
      displayName: 'Instance_' + Math.random().toString(36).substring(7)
    }
    if (shape.includes('Flex')) {
      details.shapeConfig = { ocpus, memoryInGBs: memoryGb }
    }

    const res = await this.computeClient.launchInstance({ launchInstanceDetails: details })
    return { instanceId: res.instance.id, displayName: res.instance.displayName }
  }

  async deleteInstance(instanceId) {
    await this._ensureInitialized()
    const res = await this.computeClient.terminateInstance({ instanceId })
    return { requestId: res.opcRequestId }
  }

  async instanceAction(instanceId, action) {
    await this._ensureInitialized()
    const actionMap = {
      START: 'START',
      STOP: 'STOP',
      REBOOT: 'SOFTRESET',
      HARD_REBOOT: 'RESET'
    }
    const ociAction = actionMap[action] || action
    const res = await this.computeClient.instanceAction({ instanceId, action: ociAction })
    return { requestId: res.opcRequestId }
  }

  async switchPublicIp(instanceId) {
    await this._ensureInitialized()
    const vnics = await this.computeClient.listVnicAttachments({ compartmentId: this.compartmentId, instanceId })
    if (!vnics.items.length) throw new Error('找不到 VNIC')
    const vnicDetails = await this.networkClient.getVnic({ vnicId: vnics.items[0].vnicId })

    const oldIp = vnicDetails.vnic.publicIp

    if (oldIp) {
      const pubRes = await this.networkClient.getPublicIpByIpAddress({
        getPublicIpByIpAddressDetails: { ipAddress: oldIp }
      })
      await this.networkClient.deletePublicIp({ publicIpId: pubRes.publicIp.id })
    }

    const privateIpRes = await this.networkClient.listPrivateIps({ vnicId: vnics.items[0].vnicId })
    const privateIpId = privateIpRes.items[0]?.id
    if (!privateIpId) throw new Error('找不到私网 IP')

    const newIpRes = await this.networkClient.createPublicIp({
      createPublicIpDetails: {
        compartmentId: this.compartmentId,
        displayName: 'PublicIP_' + Math.random().toString(36).substring(7),
        lifetime: 'EPHEMERAL',
        privateIpId
      }
    })

    return { newIp: newIpRes.publicIp.ipAddress, oldIp }
  }

  async addIpv6(instanceId) {
    await this._ensureInitialized()
    const vnics = await this.computeClient.listVnicAttachments({ compartmentId: this.compartmentId, instanceId })
    if (!vnics.items.length) throw new Error('找不到 VNIC')
    const { vnicId, subnetId } = vnics.items[0]

    const subnetRes = await this.networkClient.getSubnet({ subnetId })
    const vcnId = subnetRes.subnet.vcnId

    const vcnRes = await this.networkClient.getVcn({ vcnId })
    if (!vcnRes.vcn.ipv6CidrBlock) {
      await this.networkClient.addIpv6VcnCidr({ vcnId, addVcnIpv6CidrDetails: { isOracleGuaAllocationEnabled: true } })
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }

    const updatedVcn = await this.networkClient.getVcn({ vcnId })
    if (!subnetRes.subnet.ipv6CidrBlock) {
      await this.networkClient.updateSubnet({
        subnetId,
        updateSubnetDetails: { ipv6CidrBlock: updatedVcn.vcn.ipv6CidrBlock?.replace('/56', '/64') }
      })
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    const ipv6Res = await this.networkClient.createIpv6({ createIpv6Details: { vnicId } })
    return { ipAddress: ipv6Res.ipv6.ipAddress }
  }

  async modifyInstanceConfig(instanceId, config) {
    await this._ensureInitialized()
    const { ocpus, memoryInGBs, memoryGb } = config
    await this.computeClient.updateInstance({
      instanceId,
      updateInstanceDetails: { shapeConfig: { ocpus: Number(ocpus), memoryInGBs: Number(memoryInGBs || memoryGb) } }
    })
    return { success: true }
  }

  async listBootVolumes() {
    await this._ensureInitialized()
    const res = await this.blockClient.listBootVolumes({ compartmentId: this.compartmentId })
    return res.items.map((item) => ({
      id: item.id,
      displayName: item.displayName,
      sizeInGBs: item.sizeInGBs,
      state: item.lifecycleState,
      timeCreated: item.timeCreated
    }))
  }

  async deleteBootVolume(bootVolumeId) {
    await this._ensureInitialized()
    const bvRes = await this.blockClient.getBootVolume({ bootVolumeId })
    const attachmentsRes = await this.computeClient.listBootVolumeAttachments({
      availabilityDomain: bvRes.bootVolume.availabilityDomain,
      compartmentId: this.compartmentId,
      bootVolumeId
    })

    for (const att of attachmentsRes.items) {
      if (!['DETACHED', 'DETACHING'].includes(att.lifecycleState)) {
        await this.computeClient.detachBootVolume({ bootVolumeAttachmentId: att.id })
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 5000))
    await this.blockClient.deleteBootVolume({ bootVolumeId })
    return { success: true }
  }

  async allowAllInboundTraffic(instanceId) {
    await this._ensureInitialized()
    const vnics = await this.computeClient.listVnicAttachments({ compartmentId: this.compartmentId, instanceId })
    if (!vnics.items.length) throw new Error('找不到 VNIC')
    const subnetRes = await this.networkClient.getSubnet({ subnetId: vnics.items[0].subnetId })

    for (const slId of subnetRes.subnet.securityListIds || []) {
      const slRes = await this.networkClient.getSecurityList({ securityListId: slId })
      const sl = slRes.securityList
      sl.ingressSecurityRules.push(
        { protocol: 'all', source: '0.0.0.0/0', sourceType: 'CIDR_BLOCK' },
        { protocol: 'all', source: '::/0', sourceType: 'CIDR_BLOCK' }
      )
      sl.egressSecurityRules.push(
        { protocol: 'all', destination: '0.0.0.0/0', destinationType: 'CIDR_BLOCK' },
        { protocol: 'all', destination: '::/0', destinationType: 'CIDR_BLOCK' }
      )
      await this.networkClient.updateSecurityList({
        securityListId: slId,
        updateSecurityListDetails: {
          ingressSecurityRules: sl.ingressSecurityRules,
          egressSecurityRules: sl.egressSecurityRules
        }
      })
    }

    return { success: true }
  }

  async createNetwork() {
    await this._ensureInitialized()
    const vcnRes = await this.networkClient.createVcn({
      createVcnDetails: {
        compartmentId: this.compartmentId,
        displayName: 'VCN_' + Math.random().toString(36).substring(7),
        cidrBlock: '10.0.0.0/16'
      }
    })
    const vcnId = vcnRes.vcn.id
    await new Promise((resolve) => setTimeout(resolve, 3000))

    const igRes = await this.networkClient.createInternetGateway({
      createInternetGatewayDetails: {
        compartmentId: this.compartmentId,
        vcnId,
        isEnabled: true,
        displayName: 'IG_' + Math.random().toString(36).substring(7)
      }
    })

    const rtRes = await this.networkClient.listRouteTables({ compartmentId: this.compartmentId, vcnId })
    await this.networkClient.updateRouteTable({
      rtId: rtRes.items[0].id,
      updateRouteTableDetails: {
        routeRules: [
          { destination: '0.0.0.0/0', destinationType: 'CIDR_BLOCK', routeType: 'STATIC', networkEntityId: igRes.internetGateway.id },
          { destination: '::/0', destinationType: 'CIDR_BLOCK', routeType: 'STATIC', networkEntityId: igRes.internetGateway.id }
        ]
      }
    })

    const slRes = await this.networkClient.listSecurityLists({ compartmentId: this.compartmentId, vcnId })
    await this.networkClient.updateSecurityList({
      securityListId: slRes.items[0].id,
      updateSecurityListDetails: {
        ingressSecurityRules: [
          { protocol: 'all', source: '0.0.0.0/0', sourceType: 'CIDR_BLOCK' },
          { protocol: 'all', source: '::/0', sourceType: 'CIDR_BLOCK' }
        ],
        egressSecurityRules: [
          { protocol: 'all', destination: '0.0.0.0/0', destinationType: 'CIDR_BLOCK' },
          { protocol: 'all', destination: '::/0', destinationType: 'CIDR_BLOCK' }
        ]
      }
    })

    const dhcpRes = await this.networkClient.listDhcpOptions({ compartmentId: this.compartmentId, vcnId })
    const ads = await this._getAvailabilityDomains()
    const subnetRes = await this.networkClient.createSubnet({
      createSubnetDetails: {
        vcnId,
        dhcpOptionsId: dhcpRes.items[0].id,
        routeTableId: rtRes.items[0].id,
        securityListIds: [slRes.items[0].id],
        availabilityDomain: ads[0],
        compartmentId: this.compartmentId,
        cidrBlock: '10.0.1.0/24',
        displayName: 'Subnet_' + Math.random().toString(36).substring(7)
      }
    })

    return { subnetId: subnetRes.subnet.id, vcnId }
  }

  static normalizeInstance(raw, ips = {}) {
    return {
      id: raw.id,
      displayName: raw.displayName,
      state: raw.lifecycleState,
      publicIps: ips.publicIps || [],
      privateIps: ips.privateIps || [],
      ipv6Addresses: ips.ipv6s || [],
      region: raw.region,
      zone: raw.availabilityDomain,
      shape: raw.shape,
      cpu: raw.shapeConfig?.ocpus,
      memoryGb: raw.shapeConfig?.memoryInGBs,
      provider: 'oracle',
      timeCreated: raw.timeCreated,
      raw
    }
  }
}

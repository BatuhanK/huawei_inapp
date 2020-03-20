const debug = require('debug')('huawei_in_app')
const rp = require('request-promise')


const TOKEN_URL = 'https://oauth-login.cloud.huawei.com/oauth2/v2/token'
const ORDER_VERIFY_TOKEN_URL = 'https://orders-dre.iap.hicloud.com/applications/purchases/tokens/verify'
const SUBSCRIPTION_VERIFY_TOKEN_URL = 'https://subscr-dre.iap.hicloud.com/sub/applications/v2/purchases/get'

class HuaweiInApp {
    constructor (settings) {
        this.settings = settings
        debug(`initialized with client_id: ${settings.client_id}`)
    }
    async _getAccessToken () {
        const { client_secret, client_id } = this.settings
        debug(`getting access token for client_id: ${client_id}`)
        const tokenResponse = await rp({
            method: 'POST',
            url: TOKEN_URL,
            form: {
                grant_type: 'client_credentials',
                client_id,
                client_secret
            },
            json: true
        })
        tokenResponse.expires_at = new Date().getTime() + tokenResponse.expires_in
        this._tokenResponse = tokenResponse
        this._authRp = rp.defaults({
            headers: {
                Authorization: `Basic ${this._createAuthString()}`
            }
        })
        return tokenResponse
    }

    _createAuthString () {
        return Buffer.from(`APPAT:${this._tokenResponse.access_token}`).toString('base64')
    }

    async _makeAuthenticatedRequest() {
        if (!this._tokenResponse) {
            await this._getAccessToken()
        } else {
            const now = new Date().getTime()
            const tokenRemaningDuration = this._tokenResponse.expires_at - now
            if (tokenRemaningDuration <= 30) {
                debug(`obtained access_token is expired, refreshing...`)
                await this._getAccessToken()
            } else {
                debug(`we already have token, it will expire in ${tokenRemaningDuration} seconds`)
            }
        }
        return this._authRp(...arguments)
    }

    async getOrder (data) {
        const { productId, purchaseToken } = data
        const response = await this._makeAuthenticatedRequest({
            method: 'POST',
            url: ORDER_VERIFY_TOKEN_URL,
            body: {
                productId,
                purchaseToken
            },
            json: true
        })
        if (response.purchaseTokenData) {
            return { data: JSON.parse(response.purchaseTokenData), raw: response }
        }
        const err = new Error(response.responseMessage)
        err.code = response.responseCode
        throw err
    }

    async getSubscription(data) {
        const { subscriptionId, purchaseToken } = data
        const response = await this._makeAuthenticatedRequest({
            method: 'POST',
            url: SUBSCRIPTION_VERIFY_TOKEN_URL,
            body: {
                subscriptionId,
                purchaseToken
            },
            json: true
        })
        if (response.inappPurchaseData) {
            return { data: JSON.parse(response.inappPurchaseData), raw: response }
        }
        const err = new Error(response.responseMessage)
        err.code = response.responseCode
        throw err
    }
}

const instances = {}
module.exports = (settings) => {
    if (instances[settings.client_id]) {
        return instances[settings.client_id]
    }
    const instance = new HuaweiInApp(settings)
    instances[settings.client_id] = instance
    return instances[settings.client_id]
}
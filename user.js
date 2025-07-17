import Stripe from 'stripe'
import { OAuth2Client } from 'google-auth-library';
import { BaseService } from "./common/baseService.js";
import { MongoClient } from 'mongodb';
import axios from "axios";

const ERR = {
    NO_UID: 'ERR_NO_UID',
    VIP_ONLY: 'ERR_VIP_ONLY',
    NO_MORE_TOKEN: 'ERR_NO_MORE_TOKEN',
    NO_MORE_DEVICE: 'ERR_NO_MORE_DEVICE',
    API_TIMEOUT: 'ERR_API_TIMEOUT',
    UNKNOWN_MODEL: 'ERR_UNKNOWN_MODEL',
    NO_USER: 'ERR_USER_NOT_FOUND',
    CODE_ERROR: 'ERR_CODE_ERROR',
    PASSWORD_ERROR: 'ERR_PASSWORD_ERROR',
    NO_CUSTOMER_ID: 'ERR_NO_CUSTOMER_ID',
    EMAIL_EXISTS: 'ERR_EMAIL_EXISTS',
    INVALID_PRODUCT: 'ERR_INVALID_PRODUCT',
    ALREADY_PAID: 'ERR_ALREADY_PAID',
}
const stripeTesting = false
export class User extends BaseService {
    async init(gl) {
        try {
            const { config } = gl
            const client = new MongoClient(process.env.mongo);
            const res = await client.connect()
            this.client = client
            this.pname = config.project.name || 'userapi'
            this.db = this.client.db(this.pname);
            gl.mongo = this.client
            this.customerId = null //for stripe customer id

            //setup stripe
            this.endSecret_test = process.env.stripe_sec_test//mx testing
            const stripe_test = Stripe(process.env.stripe_key_test)
            this.endSecret = process.env.stripe_sec //maxthon
            const stripe = Stripe(process.env.stripe_key)
            gl.stripe = stripe
            gl.stripe_test = stripe_test

            //setup google oauth
            this.oauth = new OAuth2Client(process.env.google_cid);
        } catch (e) {
            console.error("MongoClient error:", e.message)
        }
    }
    async signup({ email, password, sip, uid, partner }) {
        const { util } = this.gl
        const docCol = this.db.collection('users');
        if (!uid) uid = Math.floor(Date.now() / 1000)
        let i = 0
        if (email) {
            const u = await this.getUser({ email })
            if (u) return { code: 100, uid: u.uid, msg: ERR.EMAIL_EXISTS }
        }

        while (++i < 1000 && await this.getUser({ uid })) {
            uid++
        }
        if (i >= 1000) return { code: 100, msg: "uid exceed" }
        const result = await docCol.insertOne({ uid, email, password, sip: util.ipv4ToInt(sip), partner })
        return { code: 0, uid }
    }
    async getUser({ uid, email }) {
        const docCol = this.db.collection('users');
        uid = +uid
        const result = uid ? await docCol.findOne({ uid }) : await docCol.findOne({ email })
        if (!result) return null
        delete result._id
        return result
    }
    async updateUser({ uid, info }) {
        const docCol = this.db.collection('users');
        uid = +uid
        const result = await docCol.updateOne({ uid }, { $set: info })
        if (result.modifiedCount > 0 || result.upsertedCount > 0) return { code: 0, msg: "success" }
        return { code: 100, msg: result }
    }
    async getUID({ req, token }) {
        const { util } = this.gl
        if (process.env.build == 'dev') {
            return +req.query.uid
        }
        if (!token) token = util.getCookie({ name: `${this.pname}_ut`, req })
        if (!token) {
            console.error("no token")
            return null
        }
        const { uid } = await util.decodeToken({ token })
        if (!uid) console.error("decode token error")
        console.log("got UID:", uid)
        return uid
    }

    async createPaymentUrl({ app = 'uugpt', uid, product, success_url, cancel_url, lang = 'en', test = false }) {
        const { config, util } = this.gl
        const stripe = test ? this.gl.stripe_test : this.gl.stripe
        const siteUrl = process.env.siteUrl
        if (lang === 'cn') lang = 'zh'
        uid = +uid
        /*const user = await this.getUser({ uid })
        if (!user) return { code: 100, msg: ERR.NO_USER }
        const { pay } = user
        if (pay && pay[product] === product && pay.endTime > util.now()) {
            console.error("already paid")
            return { code: 100, msg: ERR.ALREADY_PAID }
        }*/
        util.sendMail({ subject: `${app} payment intent`, text: `${uid} ${product}` })
        //if (!success_url) success_url = siteUrl + "/pay_success"
        //if (!cancel_url) cancel_url = siteUrl + "/pay_cancel" //config.topup

        success_url && (success_url += "?session_id={CHECKOUT_SESSION_ID}")

        let { coupon, mode, price, trial, price_zh, coupon_zh } = config.payment[product]
        if (!price) {
            return { code: 100, msg: ERR.INVALID_PRODUCT }
        }
        if (lang === 'zh' && price_zh) price = price_zh
        if (lang === 'zh' && coupon_zh) coupon = coupon_zh
        const metadata = { app, uid, product, v: 1, mode }
        const opts = {
            line_items: [{
                price,
                quantity: 1,
            }],
            discounts: [{
                coupon, // Use the existing coupon
            }],
            metadata, client_reference_id: uid,
            mode: mode === 'sub' ? "subscription" : "payment", success_url, cancel_url, automatic_tax: { enabled: true },
            payment_method_types: ['alipay', 'card'],
            //customer_email: 'test+location_CN@example.com'
        }

        if (opts.mode === 'subscription') {
            opts.subscription_data = { metadata }
            if (trial) opts.subscription_data.trial_period_days = trial
        }
        if (opts.mode === 'payment') opts.payment_intent_data = { metadata }

        const session = await stripe.checkout.sessions.create(opts);

        return { code: 0, url: session.url }

    }
    async stripe_handleEvent(event, object) {
        const { config, util } = this.gl
        let meta = {}
        let sendSuccessNotify = false
        switch (event) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated': {
                const subscription = object;
                // Access the metadata
                console.log("got subscription:", subscription)

                meta = subscription.metadata;
                if (!meta) {
                    console.error('no metadata')
                    return { code: 100, msg: "no metadata" }
                }
                const { product } = meta
                if (!config.payment[product]) {
                    console.error('unknown product')
                    return { code: 100, msg: "unknown product" }
                }
                meta.mode = 'sub'
                meta.status = subscription.status
                meta.endTime = subscription.current_period_end;
                meta.sub_id = subscription.id
                if (meta.status === 'trialing') {
                    sendSuccessNotify = true
                }
                break;
            }
            case 'invoice.payment_succeeded': {
                meta = object.subscription_details?.metadata || object.metadata;
                if (!meta) {
                    console.error('no metadata')
                    return { code: 100, msg: "no metadata" }
                }
                const { product } = meta
                if (!config.payment[product]) {
                    console.error('unknown product')
                    return { code: 100, msg: "unknown product" }
                }
                meta.mode = 'sub'
                meta.status = 'paid'
                meta.amount = object.amount_paid;
                meta.sub_id = object.subscription;
                meta.endTime = object.period_end;
                sendSuccessNotify = true;
                break;
            }
            case 'payment_intent.succeeded': { //part of subsciption
                if (object.invoice) { //handled in invoice.paid
                    return { code: 0, msg: "already handled" }
                }
                meta = object.metadata
                if (!meta) {
                    console.error('no metadata')
                    return { code: 100, msg: "no metadata" }
                }
                const { product } = meta
                if (!config.payment[product]) {
                    console.error('unknown product')
                    return { code: 100, msg: "unknown product" }
                }
                meta.mode = 'pay'
                meta.status = 'paid'
                meta.amount = object.amount_received;
                sendSuccessNotify = true;
                break;
            };
            default: {
                console.error('Unhandled event type:', event);
                return { code: 100, msg: "unknown event" }
            }
        }
        if (this.customerId !== object.customer && sendSuccessNotify) {
            this.customerId = object.customer
            console.log("got customerId:", this.customerId)
            meta.uid = +meta.uid
            meta.channel = 'stripe'
            meta.customerId = object.customer
            console.log("got metadata:", meta)
            await this.updateUser({ uid: meta.uid, info: { pay: meta } })
            this.notifyApp({ event: "order_paid", para: { meta } })
            util.sendMail({ subject: meta.app + " order paid", text: JSON.stringify({ event, meta }) })
        }
        return { code: 0, msg: "done" }
    }
    async notifyApp({ event, para }) {
        const { config } = this.gl
        const { appServer } = process.env
        const { app = 'uugpt' } = para.meta
        const notifyUrl = config.apps[app]?.notifyUrl || `${appServer}/_userapi/notify`
        console.log("notifyApp:", notifyUrl, event, para)
        try {
            await axios.post(notifyUrl, { event, para })
        } catch (error) {
            console.error("notifyApp error:", error)
        }
    }
    async sendCode({ email }) {
        const mxServer = "https://api.maxthon.com"
        const res = await axios.post(mxServer + '/web/sendcode', { email, app: this.pname, code_id: "userapi_reset" + email })
        return res.data
    }
    async verifyCode({ code, code_id }) {
        const mxServer = "https://api.maxthon.com"
        const res = await axios.post(mxServer + '/web/verifycode', { code, code_id })
        return res.data
    }
    async regEndpoints(app) {
        app.get('/test', async (req, res) => {
            //this.notifyApp({ event: 'test', para: { uid: 100, name: "abc" } })
            await this.gl.util.sendMail({ subject: "abc" })
            return { code: 0, msg: "ok" }
        })
        app.get('/signup', async (req, res) => {
            const { util } = this.gl
            let token = util.getCookie({ name: `${this.pname}_ut`, req })
            if (token) {
                const { uid } = await util.decodeToken({ token })
                if (uid)
                    return { code: 100, msg: "already logged in" }
            }
            const sip = util.getClientIp(req)

            const { email, password } = req.query || {}
            const sresult = await this.signup({ email, password, sip })
            console.log(sresult)
            const { uid } = sresult
            if (!uid) return { code: 100, msg: "signup failed" }
            token = await util.uidToToken({ uid, create: Date.now(), expire: Date.now() + 3600 * 24 * 30 })
            util.setCookie({ req, res, name: `${this.pname}_ut`, value: token, days: 30, secure: true })
            return { code: 0, uid }
        })
        app.get('/_uid', async (req) => {
            const { token } = req.query
            console.log('got token:', token)
            const uid = await this.getUID({ token })
            return { code: 0, uid }
        })
        app.get('/_info', async (req, res) => {
            const { util } = this.gl
            let { uid, email } = req.query
            if (!uid && !email) {
                return { code: 100, msg: ERR.NO_UID }
            }
            const result = await this.getUser({ uid, email })
            return { code: 0, info: result }
        })
        app.get('/info', async (req, res) => {
            const uid = await this.getUID({ req })
            if (!uid)
                return { code: 100, msg: ERR.NO_UID }
            const { withOrder } = req.query
            const result = await this.getUser({ uid, withOrder })
            return { code: 0, info: result }
        })
        app.post('/update', async (req) => {
            const { info } = req.body
            const uid = await this.getUID({ req })
            if (!uid)
                return { code: 100, msg: ERR.NO_UID }
            const result = await this.updateUser({ uid, info })
            return result
        })
        app.get('/sendCode', async (req, res) => {
            const { email } = req.query
            const result = await this.getUser({ email })
            if (!result) return { code: 100, msg: ERR.NO_USER }
            return await this.sendCode({ email })
        })
        app.get('/resetPass', async (req, res) => {
            const { email, code, new_pass } = req.query
            let result = await this.verifyCode({ code, code_id: "userapi_reset" + email })
            if (result.code != 0) return { code: 100, msg: ERR.CODE_ERROR }
            const user = await this.getUser({ email })
            if (!user) return { code: 100, msg: ERR.NO_USER }
            result = await this.updateUser({ uid: user.uid, info: { password: new_pass } })
            return result
        })
        app.get('/exist', async (req, res) => {
            const { email } = req.query
            const result = await this.getUser({ email })
            return { code: 0, exist: !!result }
        })
        app.get('/login', async (req, res) => {
            const { email, password } = req.query
            const result = await this.getUser({ email })
            if (!result) return { code: 100, msg: ERR.NO_USER }
            if (result.password != password) return { code: 100, msg: ERR.PASSWORD_ERROR }
            if (!result.uid) return { code: 100, msg: ERR.NO_UID }
            const { util } = this.gl
            const token = await util.uidToToken({ uid: result.uid, create: Date.now(), expire: Date.now() + 3600 * 24 * 30 })
            util.setCookie({ req, res, name: `${this.pname}_ut`, value: token, days: 30, secure: true })
            return { code: 0, uid: result.uid }
        })
        app.get('/login_partner', async (req, res) => {
            const { util } = this.gl
            const { partner, mxtoken } = req.query
            const mxuser = await util.getMxUser({ mxtoken })
            const uid = mxuser?.user_id
            if (!uid) return { code: 100, msg: ERR.NO_USER }
            const result = await this.getUser({ uid })
            if (!result) {
                const sip = util.getClientIp(req)
                await this.signup({ uid, sip, partner: 'mx' })
            }
            const token = await util.uidToToken({ uid, create: Date.now(), expire: Date.now() + 3600 * 24 * 30 })
            util.setCookie({ req, res, name: `${this.pname}_ut`, value: token, days: 30, secure: true })
            return { code: 0, uid }
        })
        app.post('/pay/createPayment', async (req, res) => {
            const uid = await this.getUID({ req }) || req.body?.uid
            if (!uid) return { code: 101, msg: "no uid,please login first" }
            return this.createPaymentUrl({ uid, ...req.body })
        })
        app.get('/_pay/manage-subscription', async (req, res) => {
            const customerId = req.query.cid; // 从用户会话中获取 Stripe Customer ID
            if (!customerId) return { code: 100, msg: ERR.NO_CUSTOMER_ID }
            console.log("got customerId:", customerId)
            try {
                const session = await stripe.billingPortal.sessions.create({
                    customer: customerId,
                    return_url: 'https://your-website.com/dashboard',
                });
                res.redirect(session.url); // 重定向到 Customer Portal
            } catch (error) {
                res.status(500).send('Unable to load subscription management page');
            }
        })
        app.post('/pay/callback/stripe_test', { config: { rawBody: true } }, async (req, res) => {
            const { stripe_test } = this.gl
            const sig = req.headers['stripe-signature'];
            const endpointSecret = this.endSecret_test
            let event;
            console.log("got stripe test callback body:", req.rawBody)
            try {
                event = stripe_test.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
            } catch (err) {
                console.error(err.message)
                res.status(400).send(`Webhook Error: ${err.message}`);
                return;
            }
            console.log('stripe event:', event)
            this.stripe_handleEvent(event.type, event.data.object)

            // Return a 200 response to acknowledge receipt of the event
            return { code: 0 }
        })
        app.post('/pay/callback/stripe', { config: { rawBody: true } }, async (req, res) => {
            const { stripe } = this.gl
            const sig = req.headers['stripe-signature'];
            //for local cli
            //const endpointSecret = "whsec_f4306e6f86b06692c93102051b2d0a6d93702cb866c35cc88eed1380a1e244c2";
            //for http://api.maxthon.com
            const endpointSecret = this.endSecret
            let event;
            //console.log("got stripe callback body:", req.rawBody)
            try {
                event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
            } catch (err) {
                console.error(err.message)
                res.status(400).send(`Webhook Error: ${err.message}`);
                return;
            }
            console.log('stripe event:', event)
            this.stripe_handleEvent(event.type, event.data.object)

            // Return a 200 response to acknowledge receipt of the event
            return { code: 0 }
        })
        app.post('/verify-google-token', async (req, res) => {
            const { util } = this.gl
            const { token } = req.body;
            try {
                const ticket = await this.oauth.verifyIdToken({
                    idToken: token,
                    audience: "111015791863-mvevc0jau39k9mrocfisr6cn9nr39pqj.apps.googleusercontent.com", // 保证 token 是发给你的
                });

                const payload = ticket.getPayload();  // 解码后的用户信息
                console.log("verify-google-token: got", payload);
                let uid = 0
                if (payload.email) {
                    const { email } = payload
                    const sip = util.getClientIp(req)
                    const password = payload.email + "_G_" + payload.family_name;
                    ({ uid } = await this.signup({ email, password, sip, partner: 'google' }))
                    const token = await util.uidToToken({ uid, create: Date.now(), expire: Date.now() + 3600 * 24 * 30 })
                    util.setCookie({ req, res, name: `${this.pname}_ut`, value: token, days: 30, secure: true })
                }
                // 示例返回
                return {
                    name: payload.name,
                    email: payload.email,
                    picture: payload.picture,
                    googleId: payload.sub,
                    uid,
                };
            } catch (err) {
                console.error("验证失败:", err);
                res.status(401).send({ error: "无效的 Google token" });
            }
        });
    }

}
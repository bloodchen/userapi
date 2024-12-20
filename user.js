import { BaseService } from "./common/baseService.js";
import { MongoClient } from 'mongodb';

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
        } catch (e) {
            console.error("MongoClient error:", e.message)
        }
    }
    async signup({ email, password, sip }) {
        const { util } = this.gl
        const docCol = this.db.collection('users');
        const uid = Math.floor(Date.now() / 1000)
        let i = 0
        while (i < 1000 && await this.getUser({ uid })) {
            uid++
        }
        if (i >= 1000) return { code: 1, err: "uid exceed" }
        const result = await docCol.insertOne({ uid, email, password, sip: util.ipv4ToInt(sip) })
        return { code: 0, uid }
    }
    async getUser({ uid, email }) {
        const docCol = this.db.collection('users');
        uid = +uid
        const result = uid ? await docCol.findOne({ uid }) : await docCol.findOne({ email })
        if (result) delete result._id
        return result
    }
    async updateUser({ uid, info }) {
        const docCol = this.db.collection('users');
        uid = +uid
        const result = await docCol.updateOne({ uid }, { $set: info })
        return result
    }
    async getUID({ req }) {
        const { util } = this.gl
        let token = util.getCookie({ name: `${this.pname}_ut`, req })
        if (!token) {
            console.error("no token")
            return null
        }
        const { uid } = await util.decodeToken({ token })
        if (!uid) console.error("decode token error")
        console.log("got UID:", uid)
        return uid
    }

    async regEndpoints(app) {
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
            const { uid } = await this.signup({ email, password, sip })
            token = await util.uidToToken({ uid, create: Date.now(), expire: Date.now() + 3600 * 24 * 30 })
            util.setCookie({ res, name: `${this.pname}_ut`, value: token, days: 30, secure: false })
            return { code: 0, uid }
        })
        app.get('/_info', async (req, res) => {
            const { util } = this.gl
            let { uid, email } = req.query
            if (!uid && !email) {
                return { code: 100, msg: "uid or email required" }
            }
            const result = await this.getUser({ uid, email })
            return { code: 0, info: result }
        })
        app.get('/info', async (req, res) => {
            const uid = await this.getUID({ req })
            if (!uid)
                return { code: 101, msg: "no uid" }
            const result = await this.getUser({ uid })
            return { code: 0, info: result }
        })
        app.post('/update', async (req) => {
            const { info } = req.body
            const uid = await this.getUID({ req })
            if (!uid)
                return { code: 101, msg: "no uid" }
            const result = await this.updateUser({ uid, info })
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
            if (!result) return { code: 100, msg: "user not exist" }
            if (result.password != password) return { code: 100, msg: "password error" }
            const { util } = this.gl
            const token = await util.uidToToken({ uid: result.uid, create: Date.now(), expire: Date.now() + 3600 * 24 * 30 })
            util.setCookie({ res, name: `${this.pname}_ut`, value: token, days: 30, secure: false })
            return { code: 0, uid: result.uid }
        })
    }
}
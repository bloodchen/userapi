import { BaseService } from "./common/baseService.js";

export class KVDB extends BaseService {
    async init(gl) {
        this.db = gl.user.client.db("kvdb");
    }
    async set(body) {
        const { k } = body
        if (!k) return { code: 1, err: "k is required" }
        delete body.k
        const docCol = this.db.collection('kv');
        const result = await docCol.updateOne({ k }, { $set: body }, { upsert: true })
        return body
    }
    async inc(body) {
        const { k } = body
        if (!k) return { code: 1, err: "k is required" }
        delete body.k
        const docCol = this.db.collection('kv');
        try {
            const result = await docCol.updateOne({ k }, { $inc: body }, { upsert: true })
        } catch (e) {
            console.error(e)
            return { code: 1, err: e.message }
        }
        return await this.get({ k })
    }
    async get({ k }) {
        const docCol = this.db.collection('kv');
        const result = await docCol.findOne({ k })
        if (result) delete result._id
        return result
    }
    async regEndpoints(app) {
        app.post('/kv/set', async (req) => {
            return await this.set(req.body)
        })
        app.post('/kv/inc', async (req) => {
            return await this.inc(req.body)
        })
        app.get('/kv/get', async (req) => {
            const { k } = req.query
            return await this.get({ k })
        })
    }
}
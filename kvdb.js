import { BaseService } from "./common/baseService.js";

export class KVDB extends BaseService {
    async init(gl) {
        this.db = gl.user.client.db("kvdb");
    }
    async set(body, ret = false) {
        const { k } = body
        if (!k) return { code: 1, err: "k is required" }
        delete body.k
        const docCol = this.db.collection('kv');
        const result = await docCol.updateOne({ k }, { $set: body }, { upsert: true })
        return { code: 0, result: ret ? body : null }
    }
    async inc(body, ret = false) {
        const { k } = body
        if (!k) return { code: 1, err: "k is required" }
        delete body.k
        const docCol = this.db.collection('kv');
        try {
            const result = await docCol.updateOne({ k }, { $inc: body }, { upsert: true })
        } catch (e) {
            console.error(e)
            return { code: 2, err: e.message }
        }
        if (!ret) return { code: 0 }
        const { code, result } = await this.get({ k })
        if (code != 0) return { code, err: result }
        const delKey = []
        for (let key in result) {
            if (!body[key]) delKey.push(key)
        }
        for (let key of delKey) {
            delete result[key]
        }
        return { code: 0, result }
    }
    async get({ k }) {
        const docCol = this.db.collection('kv');
        const result = await docCol.findOne({ k })
        if (result) delete result._id
        return { code: 0, result }
    }
    async regEndpoints(app) {
        app.post('/kv/set', async (req) => {
            const { ret = false } = req.query
            return await this.set(req.body, ret)
        })
        app.post('/kv/inc', async (req) => {
            const { ret = false } = req.query
            return await this.inc(req.body, ret)
        })
        app.get('/kv/get', async (req) => {
            const { k } = req.query
            return await this.get({ k })
        })
    }
}
import { BaseService } from "./common/baseService.js";

export class KVDB extends BaseService {
    async init(gl) {
        this.db = gl.user.client.db("kvdb");
    }
    async set({ k, v }) {
        const docCol = this.db.collection('kv');
        const result = await docCol.updateOne({ k }, { $set: { v } }, { upsert: true })
        return { k: v }
    }
    async inc({ k, n = 1 }) {
        const docCol = this.db.collection('kv');
        const result = await docCol.updateOne({ k }, { $inc: { v: n } }, { upsert: true })
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
            const { k, v } = req.body
            return await this.set({ k, v })
        })
        app.post('/kv/inc', async (req) => {
            const { k, n } = req.body
            return await this.inc({ k, n })
        })
        app.get('/kv/get', async (req) => {
            const { k } = req.query
            return await this.get({ k })
        })
    }
}
import fastifyModule from 'fastify';
import cors from '@fastify/cors'
import fasticookie from '@fastify/cookie'

import dotenv from "dotenv";
import { Config } from './config.js';
import { User } from './user.js';
import { Util } from './common/util.js';
import { KVDB } from './kvdb.js';

const app = fastifyModule({ logger: false });
const gl = {}
gl.logger = console
gl.config = Config
gl.app = app
async function onExit() {
    console.log("exiting...")
    process.exit(0);
}
async function startServer() {
    const port = process.env.port || 8080
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Starting ${Config.project.name} service on:`, port)
}
dotenv.config({ path: 'env' })
async function main() {
    await regEndpoints()
    await User.create(gl)
    await Util.create(gl)
    await KVDB.create(gl)
    await startServer()
    process.on('SIGINT', onExit);
    process.on('SIGTERM', onExit);
}
async function regEndpoints() {
    await app.register(cors, { origin: true, credentials: true, allowedHeaders: ['content-type'] });
    await app.register(fasticookie)
    await app.register(import('fastify-raw-body'), {
        field: 'rawBody', // change the default request.rawBody property name
        global: false, // add the rawBody to every request. **Default true**
        encoding: 'utf8', // set it to false to set rawBody as a Buffer **Default utf8**
        runFirst: true, // get the body before any preParsing hook change/uncompress it. **Default false**
        routes: [] // array of routes, **`global`** will be ignored, wildcard routes not supported
    })
    app.addHook("preHandler", async (req, res) => {
        console.log(req.url)
    })
    app.get('/', (req, res) => {
        console.log(req.url)
        return Config.project.name
    })

    /*app.post('/logSearch', async (req, res) => {
        const body = req.body
        console.log(body)
        return "ok"
    })*/
}
main()

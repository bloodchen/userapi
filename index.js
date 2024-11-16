import fastifyModule from 'fastify';
import cors from '@fastify/cors'
import dotenv from "dotenv";
import { Config } from './config.js';

const app = fastifyModule({ logger: false });
const gl = {}
gl.config = Config
async function onExit() {
    console.log("exiting...")
    process.exit(0);
}
async function startServer() {
    await app.register(cors, { origin: true, credentials: true, allowedHeaders: ['content-type'] });
    app.addHook("preHandler", async (req, res) => {
        console.log(req.url)
    })
    const port = process.env.port || 8080
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Starting ${Config.project.name} service on:`, port)
}
dotenv.config()
async function main() {
    startServer()
    process.on('SIGINT', onExit);
    process.on('SIGTERM', onExit);
}
app.get('/', (req, res) => {
    console.log(req.url)
    return Config.project.name
})
app.get('/test', async (req, res) => {

    return "ok"
})
app.post('/logSearch', async (req, res) => {
    const body = req.body
    console.log(body)
    return "ok"
})
main()

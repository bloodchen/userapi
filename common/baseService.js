export class BaseService {
    static async create(gl) {
        const inst = new this()
        inst.gl = gl
        const { logger } = gl
        logger.info("initializing:", inst.constructor.name)
        const err = await inst.init(gl)
        if (err) {
            logger.error("initializing ", inst.constructor.name, "failed:", err)
            throw new Error(err)
        }
        logger.info("initializing ", inst.constructor.name, " successfully")
        if (inst.regEndpoints) {
            logger.info("registing endpoints for ", inst.constructor.name)
            await inst.regEndpoints(gl.app)
        }
        return inst
    }
}
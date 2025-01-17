import crypto from 'crypto';
import { BaseService } from "./baseService.js";

export class Util extends BaseService {
    async init(gl) {
        this.tokenPass = process.env.tokenPass || "2rnma5xsc3efx1Z$#%^09FYkRfuAsxTB"
    }
    setCookie({ res, name, value, path = '/', secure = true, days, httpOnly = false, sameSite = 'lax' }) {
        const expire = days ? days * 24 * 60 * 60 : -1
        const options = {
            maxAge: expire,
            httpOnly,
            path,
            sameSite,
            secure
        }
        if (!days) delete options.maxAge
        res.setCookie(name, value, options)
    }
    getCookie({ req, name }) {
        return req.cookies[name]
    }
    encrypt({ data, password, to_encoding = 'hex', iv, length = 256 }) {
        const buf = Buffer.from(data)
        if (iv) iv = Buffer.from(iv)
        var iv1 = iv || crypto.randomBytes(16)
        var algorithm = `aes-${length}-cbc`;
        var cipher = crypto.createCipheriv(algorithm, Buffer.from(password), iv1)
        var crypted = Buffer.concat([iv1, cipher.update(buf), cipher.final()]);
        return crypted.toString(to_encoding);
    }
    decrypt({ data, password, from_encoding = 'hex', to_encoding = 'utf8', length = 256 }) {
        try {
            const buf = Buffer.from(data, from_encoding)
            var iv = buf.subarray(0, 16)
            var algorithm = `aes-${length}-cbc`;
            var decipher = crypto.createDecipheriv(algorithm, Buffer.from(password), iv)
            var decrypted = Buffer.concat([decipher.update(buf.subarray(16)), decipher.final()]);
            return decrypted.toString(to_encoding);
        } catch (e) {
            return null
        }

    }
    async uidToToken({ uid, create, expire }) {
        try {
            const data = JSON.stringify({ uid, create, expire })
            return "0-" + await this.encrypt({ data, password: this.tokenPass, to_encoding: "hex" })
        } catch (e) {
            console.error(e.message)
        }
        return null
    }
    async decodeToken({ token }) {
        try {
            const ver = token.slice(0, 2)
            const data = this.decrypt({ data: token.slice(2), password: this.tokenPass, from_encoding: "hex" })
            const user = JSON.parse(data)
            return user || {}
        } catch (e) {
            console.error(e.message)
        }
        return {}
    }
    getClientIp(req) {
        let IP =
            //req.ip ||
            req.headers['CF-Connecting-IP'] ||
            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress ||
            req.connection.remoteAddress ||
            req.connection.socket.remoteAddress;
        IP = IP.split(',')[0]
        //IP = IP.split(":").pop()
        return IP;
    }
    ipv4ToInt(ip) {
        return ip.split('.').reduce((int, part) => (int << 8) + parseInt(part, 10), 0);
    }
}
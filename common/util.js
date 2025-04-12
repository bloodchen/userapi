import crypto from 'crypto';
import { BaseService } from "./baseService.js";
import axios from 'axios';

export class Util extends BaseService {
    async init(gl) {
        this.tokenPass = process.env.tokenPass || "2rnma5xsc3efx1Z$#%^09FYkRfuAsxTB"
    }
    setCookie({ req, res, name, value, path = '/', secure = true, domain = 'root', days, httpOnly = false, sameSite = 'none' }) {
        const expire = days ? days * 24 * 60 * 60 : -1
        const hostParts = (new URL("http://" + req.headers['host'])).hostname.split('.')
        const rootDomain = hostParts.slice(-2).join('.')
        if (domain === 'root') domain = rootDomain
        if (domain !== 'root') domain = '.' + domain
        const options = {
            maxAge: expire,
            httpOnly,
            path,
            domain,
            sameSite,
            secure
        }
        if (!days) delete options.maxAge
        res.setCookie(name, value, options)
    }
    getCookie({ req, name }) {
        return req.cookies[name]
    }
    async getMxUser({ mxtoken }) {
        const res = await axios.get('https://api.maxthon.com/web/profile', {
            headers: { mxtoken }
        })
        return res.data || {}
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
            console.log(user)
            return user || {}
        } catch (e) {
            console.error(e.message)
        }
        return {}
    }
    getClientIp(req) {
        let IP =
            //req.ip ||
            req.headers['cf-connecting-ip'] ||
            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress ||
            req.connection.remoteAddress ||
            req.connection.socket.remoteAddress;
        IP = IP.split(',')[0]
        //IP = IP.split(":").pop()
        return IP;
    }
    ipv4ToInt(ip) {
        if (!ip) return null
        return ip.split('.').reduce((int, part) => (int << 8) + parseInt(part, 10), 0);
    }
    createUID({ type = 'normal' } = {}) {
        const now = Math.floor(Date.now() / 1000)
        let uid = now
        if (this.lastnow >= now) {
            uid = this.lastnow + 1
            this.lastnow = uid
        } else
            this.lastnow = now
        return +uid
    }
    randomNumber(n) {
        if (n <= 0) {
            throw new Error("The number of digits must be greater than 0.");
        }

        let number = ""; // 用于存储生成的数字

        while (number.length < n) {
            // 每次生成一个最多 `n` 位的随机部分，拼接到结果中
            const remaining = n - number.length;
            const maxDigits = Math.min(remaining, 12); // 限制最多生成 12 位（安全范围）
            const min = Math.pow(10, maxDigits - 1);
            const max = Math.pow(10, maxDigits) - 1;
            const randomPart = Math.floor(Math.random() * (max - min + 1)) + min;
            number += randomPart.toString(); // 拼接结果
        }

        return number.substring(0, n); // 截取结果，保证长度为 n
    }
    now() {
        return Math.floor(Date.now() / 1000)
    }
}
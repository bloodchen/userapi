import { BaseService } from "./common/baseService.js";
import { google } from "googleapis";

export class Providers extends BaseService {
    async init(gl) {
        const { config } = gl
        this.googleOauth = new google.auth.OAuth2(
            process.env.google_cid,
            process.env.google_secret,
            'http://localhost:8083/callback/google'
        );
        this.googleUrl = this.googleOauth.generateAuthUrl({
            state: JSON.stringify({ custom: 'uugpt' }), // Add custom data to the state parameter
            access_type: 'offline', // Request offline access to get refresh tokens
            scope: ['https://www.googleapis.com/auth/adsense.readonly'],
            prompt: 'consent'
        });
    }
    getAuthUrl({ provider = 'google' }) {
        if (provider === 'google') return this.googleUrl
        return null
    }
    async regEndpoints(app) {
        app.get('/callback/google', async (req) => {
            const { code } = req.query
            const { custom } = JSON.parse(req.query.state)
            const client = this.googleOauth
            // Exchange the authorization code for access and refresh tokens
            const res = await client.getToken(code)
            if (res.err) {
                console.error('Error retrieving access token:', res.err);
                return;
            }
            // Store the refresh token securely for future use
            console.log('Access Token:', res.tokens.access_token);
            console.log('Refresh Token:', res.tokens.refresh_token);
        })
    }
}
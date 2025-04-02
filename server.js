require("dotenv").config();
const express = require("express");
const cors = require("cors");
const {ethers} = require("ethers");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const SHARD_RPC_URLS = [
    'https://mainnet-s0-ethapi.quarkchain.io',
    'https://mainnet-s1-ethapi.quarkchain.io',
    'https://mainnet-s2-ethapi.quarkchain.io',
    'https://mainnet-s3-ethapi.quarkchain.io',
    'https://mainnet-s4-ethapi.quarkchain.io',
    'https://mainnet-s5-ethapi.quarkchain.io',
    'https://mainnet-s6-ethapi.quarkchain.io',
    'https://mainnet-s7-ethapi.quarkchain.io',
];

const ShardBlockNumbers = [
    19006876, // 0
    18942835, // 1
    18982674, // 2
    19039018, // 3
    19070861, // 4
    18979362, // 5
    18918433, // 6
    18873388, // 7
];

async function getBalance(rpcUrl, address, blockNumber) {
    const response = await axios.post(rpcUrl, {
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [address, blockNumber ? `0x${blockNumber.toString(16)}` : "latest"],
        id: 1
    });
    return BigInt(response.data.result);
}

// **获取用户的总余额**
async function getTotalBalance(address) {
    // 获取每个分片的余额
    const balances = await Promise.all(
        SHARD_RPC_URLS.map((rpc, i) => getBalance(rpc, address, ShardBlockNumbers[i] || null))
    );

    // 计算总余额（BigInt 相加）
    const totalBalance = balances.reduce((sum, balance) => sum + balance, 0n);
    const formattedBalance = ethers.formatEther(totalBalance);
    return parseFloat(formattedBalance).toFixed(2);
}





app.get("/balance", async (req, res) => {
    try {
        const addresses = req.query.addresses?.split(",") || [];
        if (!addresses.length) {
            return res.status(400).json({ error: "Missing addresses" });
        }

        const results = {};
        for (const address of addresses) {
            results[address] = await getTotalBalance(address);
        }

        res.json({ score: Object.entries(results).map(([address, score]) => ({ address, score })) });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

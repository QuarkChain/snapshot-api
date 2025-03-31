require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// TODO
const SHARD_RPC_URLS = Array.from({ length: 8 }, (_, i) => `http://88.99.30.186:${39900 + i}`);

async function getBalance(rpcUrl, address, blockNumber) {
    try {
        const response = await axios.post(rpcUrl, {
            jsonrpc: "2.0",
            method: "eth_getBalance",
            params: [address, blockNumber ? `0x${blockNumber.toString(16)}` : "latest"],
            id: 1
        });
        return response.data.result ? BigInt(response.data.result) : 0n;
    } catch (error) {
        console.error(`Error fetching balance from ${rpcUrl}:`, error.message);
        return 0n;
    }
}

async function getShardBlockNumber(rpcUrl) {
    try {
        const response = await axios.post(rpcUrl, {
            jsonrpc: "2.0",
            method: "eth_blockNumber",
            params: [],
            id: 1
        });

        return response.data.result ? parseInt(response.data.result, 16) : 0;
    } catch (error) {
        console.error(`Error fetching block number from ${rpcUrl}:`, error.message);
        return 0;
    }
}

// **计算 ETH 高度对应的分片高度**
async function convertEthToShardBlock(ethBlockNumber) {
    // 获取所有分片的当前最高高度
    const shardBlockNumbers = await Promise.all(SHARD_RPC_URLS.map(getShardBlockNumber));

    // ETH 高度偏移
    const ethLatestBlock = await getShardBlockNumber("https://eth.llamarpc.com");
    const ethBlockDelta = ethLatestBlock - ethBlockNumber;

    // 计算对应的分片高度（假设每个分片 12 秒一个块）
    return shardBlockNumbers.map(shardHeight => Math.max(0, shardHeight - ethBlockDelta));
}

// **获取用户的总余额**
async function getTotalBalance(address, ethSnapshot) {
    // 计算 ETH 高度对应的各分片高度
    const shardBlockNumbers = ethSnapshot ? await convertEthToShardBlock(ethSnapshot) : [];
    console.log("shardBlockNumbers", shardBlockNumbers)

    // 获取每个分片的余额
    const balances = await Promise.all(
        SHARD_RPC_URLS.map((rpc, i) => getBalance(rpc, address, shardBlockNumbers[i] || null))
    );

    // 计算总余额（BigInt 相加）
    const totalBalance = balances.reduce((sum, balance) => sum + balance, 0n);
    return ethers.formatEther(totalBalance);
}





app.get("/balance", async (req, res) => {
    try {
        const addresses = req.query.addresses?.split(",") || [];
        if (!addresses.length) {
            return res.status(400).json({ error: "Missing addresses" });
        }

        const snapshot = req.query.snapshot ? parseInt(req.query.snapshot) : null;
        const results = {};
        for (const address of addresses) {
            results[address] = await getTotalBalance(address, snapshot);
        }

        res.json({ score: Object.entries(results).map(([address, score]) => ({ address, score })) });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// 启动服务器
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

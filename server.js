require("dotenv").config();
const express = require("express");
const cors = require("cors");
const {ethers} = require("ethers");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// TODO
const SHARD_RPC_URLS = [
    'http://88.99.30.186:39900',
    'http://88.99.30.186:39901',
    'http://88.99.30.186:39902',
    'http://88.99.30.186:39903',
    'http://88.99.30.186:39904',
    'http://88.99.30.186:39905',
    'http://88.99.30.186:39906',
    'http://88.99.30.186:39907'
];
const ETH_RPC_URL = "https://eth.llamarpc.com";
const ethToShardBlockCache = {};

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

async function getBlockNumber(rpcUrl) {
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

async function getBlockTimestamp(rpcUrl, blockNumber) {
    try {
        const response = await axios.post(rpcUrl, {
            jsonrpc: "2.0",
            method: "eth_getBlockByNumber",
            params: [ "0x" + blockNumber.toString(16), false ],
            id: 1
        });
        if (!response.data.result || !response.data.result.timestamp) return 0;
        return parseInt(response.data.result.timestamp, 16);
    } catch (error) {
        console.error(`Error fetching timestamp from ${rpcUrl}:`, error.message);
        return 0;
    }
}


// 启动时获取区块高度
let shardBlockData = [];

async function initializeShardData() {
    shardBlockData = await Promise.all(
        SHARD_RPC_URLS.map(async (rpcUrl) => {
            return await getBlockNumber(rpcUrl);
        })
    );
}

async function binarySearchBlock(rpc, ethBlockTimestamp, startBlock, latestBlock) {
    let low = startBlock, high = latestBlock;
    while (low <= high) {
        let mid = Math.floor((low + high) / 2);
        const midTimestamp = await getBlockTimestamp(rpc, mid);
        if (midTimestamp === 0) break;

        if (Math.abs(midTimestamp - ethBlockTimestamp) <= 60) {
            return mid;
        } else if (midTimestamp > ethBlockTimestamp) {
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
    return low;
}

// **计算 ETH 高度对应的分片高度**
async function convertEthBlockToShardBlock(ethBlockNumber) {
    if (ethToShardBlockCache[ethBlockNumber]) {
        return ethToShardBlockCache[ethBlockNumber];
    }

    const ethTimestamp = await getBlockTimestamp(ETH_RPC_URL, ethBlockNumber);
    if (ethTimestamp === 0) return await Promise.all(SHARD_RPC_URLS.map(getBlockNumber));

    const shardBlockNumbers = await Promise.all(
        SHARD_RPC_URLS.map(async (rpc, index) => {
            const latestBlock = await getBlockNumber(rpc);
            const blockNumber = await binarySearchBlock(rpc, ethTimestamp, shardBlockData[index], latestBlock);
            return Math.max(0, blockNumber);
        })
    );
    ethToShardBlockCache[ethBlockNumber] = shardBlockNumbers;
    return shardBlockNumbers;
}


// **获取用户的总余额**
async function getTotalBalance(address, ethSnapshot) {
    // 计算 ETH 高度对应的各分片高度
    const shardBlockNumbers = ethSnapshot ? await convertEthBlockToShardBlock(ethSnapshot) : [];
    console.log("shardBlockNumbers", shardBlockNumbers)

    // 获取每个分片的余额
    const balances = await Promise.all(
        SHARD_RPC_URLS.map((rpc, i) => getBalance(rpc, address, shardBlockNumbers[i] || null))
    );

    // 计算总余额（BigInt 相加）
    const totalBalance = balances.reduce((sum, balance) => sum + balance, 0n);
    return ethers.formatEther(totalBalance).split(".")[0];
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
initializeShardData().then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
    });
});

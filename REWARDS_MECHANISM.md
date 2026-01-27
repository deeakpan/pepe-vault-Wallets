# Unchained Wallet Rewards Mechanism

## 🎯 Core Principle

**Users earn 10% of the fees they pay as rewards in UCHAIN tokens.**

This creates a cashback system where every transaction generates rewards, incentivizing active usage of the Unchained Wallet platform.

---

## 📊 Detailed Reward Structure

### 1. ERC20 Token Transfers

**Fee Structure:**
- **Fee Rate:** 0.85% of transfer amount (paid in the same token)
- **Example:** Transfer 1,000 tokens → Fee = 8.5 tokens

**Reward Structure:**
- **If transfer value < $1 USD:** Fixed **10 UCHAIN tokens** (minimum guarantee)
- **If transfer value ≥ $1 USD:** **10% of fee amount** (converted to UCHAIN via Quoter contract)

**Calculation Example:**
- Transfer 1,000 tokens worth $50
- Fee = 8.5 tokens (0.85%)
- Quoter converts 8.5 tokens → X UCHAIN
- Reward = 10% of X UCHAIN

---

### 2. ERC20 Token Swaps

**Fee Structure:**
- **Fee Rate:** 0.85% of swap amount (paid in the token being swapped FROM)
- **Example:** Swap 1,000 tokens → Fee = 8.5 tokens

**Reward Structure:**
- **Always:** **10% of fee amount** (converted to UCHAIN via Quoter contract)
- Uses on-chain pricing for accurate conversion

**Calculation Example:**
- Swap 1,000 tokens worth $100
- Fee = 8.5 tokens (0.85%)
- Quoter converts 8.5 tokens → X UCHAIN
- Reward = 10% of X UCHAIN

---

### 3. Native PEPU Transfers

**Fee Structure:**
- **If transfer value ≥ $1:** $0.05 USD worth of PEPU
- **If transfer value < $1:** 5% of transfer amount

**Reward Structure:**
- **Fixed:** $0.005 USD worth of UCHAIN tokens per transfer
- Not percentage-based (fixed cashback)

---

### 4. Native PEPU Swaps

**Fee Structure:**
- **Fee Rate:** 0.85% of swap amount (paid in PEPU)

**Reward Structure:**
- **Always:** **10% of fee amount** (converted to UCHAIN via CoinGecko price)

**Calculation Example:**
- Swap 1,000 PEPU worth $50
- Fee = 8.5 PEPU (0.85%)
- Convert 8.5 PEPU to USD → Convert to UCHAIN
- Reward = 10% of that UCHAIN amount

---

## 📋 Summary Table

| Transaction Type | Fee Rate | Reward Rate | Minimum Reward |
|-----------------|----------|-------------|----------------|
| ERC20 Transfer (< $1) | 0.85% | 10 UCHAIN fixed | 10 UCHAIN |
| ERC20 Transfer (≥ $1) | 0.85% | 10% of fee | - |
| ERC20 Swap | 0.85% | 10% of fee | - |
| Native PEPU Transfer | $0.05 or 5% | $0.005 UCHAIN fixed | - |
| Native PEPU Swap | 0.85% | 10% of fee | - |

---

## 🔑 Key Features

### 1. Universal 10% Cashback
Most transactions earn **10% of fees paid** as UCHAIN rewards, creating a consistent incentive structure across the platform.

### 2. On-Chain Pricing Accuracy
ERC20 rewards use the **Quoter contract** for accurate UCHAIN conversion, ensuring fair and transparent reward calculations based on real-time on-chain data.

### 3. Minimum Guarantee
Small ERC20 transfers (< $1) receive a **10 UCHAIN minimum reward**, ensuring even micro-transactions generate meaningful rewards.

### 4. Automatic Accumulation
Rewards automatically accumulate per wallet address and can be claimed anytime through the rewards dashboard.

### 5. Eligibility Requirement
Users must hold **1 UCHAIN token** to claim rewards, creating a natural token distribution mechanism.

---

## 💡 Example Scenarios

### Scenario 1: Transfer $100 worth of ERC20 tokens
- **Fee:** 0.85% = $0.85 worth of tokens
- **Reward:** 10% of $0.85 = **$0.085 worth of UCHAIN**

### Scenario 2: Swap $1,000 worth of tokens
- **Fee:** 0.85% = $8.50 worth of tokens
- **Reward:** 10% of $8.50 = **$0.85 worth of UCHAIN**

### Scenario 3: Transfer $0.50 worth of ERC20 tokens
- **Fee:** 0.85% = $0.00425 worth of tokens
- **Reward:** **10 UCHAIN tokens** (minimum guarantee)

### Scenario 4: Transfer $5 worth of native PEPU
- **Fee:** $0.05 USD worth of PEPU
- **Reward:** **$0.005 USD worth of UCHAIN** (fixed)

### Scenario 5: Swap $500 worth of native PEPU
- **Fee:** 0.85% = $4.25 worth of PEPU
- **Reward:** 10% of $4.25 = **$0.425 worth of UCHAIN**

---

## 🎁 Why This System Works

1. **Transparent & Fair:** All calculations use on-chain data or reputable price feeds
2. **Incentivizes Usage:** Every transaction generates rewards, encouraging platform engagement
3. **Scalable:** Percentage-based system scales with transaction volume
4. **User-Friendly:** Simple 10% cashback model is easy to understand
5. **Token Distribution:** Natural mechanism for distributing UCHAIN tokens to active users

---

## 📈 Reward Calculation Methods

### For ERC20 Tokens (Transfers & Swaps)
1. Calculate fee: `0.85% of transaction amount`
2. Convert fee to UCHAIN equivalent using **Quoter contract** (on-chain pricing)
3. Calculate reward: `10% of UCHAIN equivalent`

### For Native PEPU Swaps
1. Calculate fee: `0.85% of swap amount`
2. Get PEPU price from **CoinGecko API**
3. Convert fee to USD value
4. Get UCHAIN price from **CoinGecko API**
5. Calculate reward: `10% of (fee in USD / UCHAIN price)`

### For Native PEPU Transfers
1. Calculate fee based on transfer value
2. Get UCHAIN price from **CoinGecko API**
3. Calculate reward: `$0.005 / UCHAIN price`

---

## 🚀 Getting Started

1. **Hold UCHAIN:** Ensure you have at least 1 UCHAIN token in your wallet
2. **Make Transactions:** Every transfer or swap automatically generates rewards
3. **Check Balance:** View your accumulated rewards in the rewards dashboard
4. **Claim Rewards:** Withdraw your UCHAIN rewards anytime

---

*Last Updated: 2024*


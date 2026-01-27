# Fee Mechanism Documentation

## Overview

The PEPU VAULT WALLET implements a comprehensive fee system that applies fees to transactions and swaps on the PEPU (Pepe Unchained V2) chain. All fees are collected and sent to a designated fee wallet address.

---

## Fee Types

### 1. Native PEPU Transaction Fees

**When Applied:** All native PEPU token transfers on the PEPU chain (Chain ID: 97741)

**Fee Calculation:**
- **If transfer value ≥ $1 USD:** Fixed fee of **$0.05 USD** worth of PEPU
- **If transfer value < $1 USD:** **5% of the transfer amount** in PEPU

**How It Works:**
1. The system fetches the current PEPU price from CoinGecko API
2. Calculates the USD value of the transfer amount
3. Applies the appropriate fee based on the transfer value
4. Checks if the user has sufficient PEPU balance (amount + fee)
5. Sends the fee to the fee wallet address in a separate transaction
6. Then sends the main transfer transaction

**Example:**
- Transfer: 100 PEPU (worth $10)
  - Fee: $0.05 worth of PEPU (calculated dynamically)
  - User needs: 100 PEPU + fee amount
  
- Transfer: 0.5 PEPU (worth $0.50)
  - Fee: 5% of 0.5 = 0.025 PEPU
  - User needs: 0.5 PEPU + 0.025 PEPU = 0.525 PEPU

**Code Location:** `lib/fees.ts` - `calculateTransactionFeePepu()`

---

### 2. ERC-20 Token Transaction Fees

**When Applied:** All ERC-20 token transfers on the PEPU chain

**Fee Calculation:** **0.85% of the amount being sent**

**How It Works:**
1. Calculates 0.85% of the transfer amount in the same token
2. Deducts the fee from the transfer amount
3. Sends the fee to the fee wallet in the same token
4. Sends the remaining amount (after fee) to the recipient

**Example:**
- Transfer: 1000 USDC
  - Fee: 0.85% = 8.5 USDC
  - Recipient receives: 991.5 USDC
  - Fee wallet receives: 8.5 USDC

**Code Location:** `lib/fees.ts` - `calculateERC20TokenFee()`

---

### 3. Swap Fees

**When Applied:** All token swaps on the PEPU chain (via Uniswap V3)

**Fee Calculation:** **0.85% of the token amount being swapped FROM**

**How It Works:**
1. Calculates 0.85% of the input token amount
2. Deducts the fee from the input amount
3. Uses the remaining amount (after fee) for the swap
4. Sends the fee to the fee wallet in the input token
5. User receives the swapped output tokens (minus Uniswap pool fees)

**Example:**
- Swap: 1000 PEPU → USDC
  - Fee: 0.85% = 8.5 PEPU
  - Amount used for swap: 991.5 PEPU
  - Fee wallet receives: 8.5 PEPU
  - User receives: USDC equivalent of 991.5 PEPU (minus Uniswap fees)

**Code Location:** `lib/fees.ts` - `calculateSwapFee()`

---

## Fee Wallet Configuration

### Setting the Fee Wallet

The fee wallet address is configured via the `NEXT_PUBLIC_FEE_WALLET` environment variable.

**Required:** Yes  
**Format:** Ethereum address (0x...)

**Setup:**
1. Create a wallet address to receive all fees
2. Set the environment variable:
   ```bash
   NEXT_PUBLIC_FEE_WALLET=0xYourFeeWalletAddress
   ```
3. For production (Vercel), add this in your project settings

**Code Location:** `lib/config.ts` - `FEE_WALLET`

---

## Fee Collection Flow

### Native PEPU Transactions

```
User Wallet
    │
    ├─> Check Balance (amount + fee)
    │
    ├─> Send Fee Transaction → Fee Wallet
    │   └─> Amount: Calculated fee in PEPU
    │
    └─> Send Main Transaction → Recipient
        └─> Amount: User-specified amount
```

### ERC-20 Token Transactions

```
User Wallet
    │
    ├─> Check Token Balance (full amount)
    │
    ├─> Calculate Fee (0.85% of amount)
    │
    ├─> Send Fee Transaction → Fee Wallet
    │   └─> Token: Same as transfer token
    │   └─> Amount: 0.85% of transfer amount
    │
    └─> Send Main Transaction → Recipient
        └─> Token: Same as transfer token
        └─> Amount: 99.15% of transfer amount
```

### Swap Transactions

```
User Wallet
    │
    ├─> Check Token Balance (full input amount)
    │
    ├─> Calculate Fee (0.85% of input)
    │
    ├─> Send Fee Transaction → Fee Wallet
    │   └─> Token: Input token
    │   └─> Amount: 0.85% of input
    │
    └─> Execute Swap
        └─> Input: 99.15% of original amount
        └─> Output: Swapped tokens (minus Uniswap fees)
```

---

## Balance Validation

Before any transaction, the system validates that the user has sufficient balance:

### Native PEPU
- **Required:** Transfer amount + Fee amount
- **Check:** Native PEPU balance ≥ (amount + fee)

### ERC-20 Tokens
- **Required:** Full transfer amount (fee is deducted from it)
- **Check:** Token balance ≥ transfer amount

### Swaps
- **Required:** Full input amount (fee is deducted from it)
- **Check:** Input token balance ≥ swap amount

**Code Location:** `lib/fees.ts` - `checkTransactionFeeBalance()`, `checkSwapFeeBalance()`

---

## Fee Configuration

All fee parameters are defined in `lib/config.ts`:

```typescript
// Transaction fee for native PEPU (when transfer ≥ $1)
export const TRANSACTION_FEE_USD = 0.05 // $0.05

// Swap fee percentage
export const SWAP_FEE_PERCENTAGE = 0.85 // 0.85%
```

**Note:** ERC-20 transaction fees are hardcoded at 0.85% in `calculateERC20TokenFee()`.

---

## Error Handling

### Insufficient Balance
If a user doesn't have enough balance for the transaction + fee:
- Transaction is blocked
- Error message displayed: "Insufficient balance. Required: X, Available: Y"

### Fee Wallet Not Configured
If `NEXT_PUBLIC_FEE_WALLET` is not set or invalid:
- Transaction fails with error: "Fee wallet address not configured"
- User cannot complete transactions on PEPU chain

### RPC Errors
If RPC calls fail during fee calculation or sending:
- Error is reported via RPC health system
- User sees RPC connection notification
- Transaction is blocked until RPC is healthy

---

## Chain-Specific Behavior

### PEPU Chain (Chain ID: 97741)
- ✅ Native PEPU transaction fees apply
- ✅ ERC-20 token transaction fees apply
- ✅ Swap fees apply

### Ethereum Mainnet (Chain ID: 1)
- ❌ No transaction fees (standard gas fees only)
- ❌ No swap fees (standard gas fees only)
- ✅ Standard Ethereum gas model applies

---

## Fee Revenue Model

### Revenue Sources
1. **Native PEPU Transactions:** $0.05 per transaction (or 5% for small transfers)
2. **ERC-20 Token Transactions:** 0.85% of transfer amount
3. **Token Swaps:** 0.85% of swap input amount

### Fee Collection
- All fees are collected in the configured fee wallet
- Fees are sent automatically before/with each transaction
- No manual intervention required

---

## Security Considerations

1. **Fee Wallet Security:**
   - Store the fee wallet private key securely
   - Use a hardware wallet or secure key management system
   - Never expose the private key in code or environment variables

2. **Fee Calculation:**
   - Fees are calculated client-side using real-time price data
   - Price data is fetched from CoinGecko API (for PEPU price)
   - Fee calculations are deterministic and transparent

3. **Balance Validation:**
   - All balance checks happen before transaction execution
   - Prevents failed transactions and wasted gas
   - Clear error messages for insufficient balance

---

## Testing Fees

To test the fee mechanism:

1. **Native PEPU Transfer:**
   - Send a small amount (< $1) → Should charge 5%
   - Send a larger amount (≥ $1) → Should charge $0.05 worth

2. **ERC-20 Transfer:**
   - Send any amount → Should deduct 0.85% as fee

3. **Swap:**
   - Swap any tokens → Should deduct 0.85% from input amount

4. **Balance Checks:**
   - Try sending more than balance → Should show error
   - Try sending exact balance (without fee) → Should show error

---

## Monitoring

### Fee Wallet Balance
Monitor the fee wallet address to track:
- Total fees collected
- Fee collection frequency
- Token types received

### Transaction Logs
Check transaction logs for:
- Fee transaction hashes
- Fee amounts sent
- Fee wallet address confirmations

---

## Future Enhancements

Potential improvements:
- Dynamic fee rates based on network congestion
- Fee discounts for high-volume users
- Fee sharing with token holders
- Multi-signature fee wallet
- Fee analytics dashboard

---

## Support

For issues related to fees:
1. Check that `NEXT_PUBLIC_FEE_WALLET` is configured
2. Verify fee wallet has sufficient balance (for gas)
3. Check RPC connection health
4. Review transaction logs for fee transactions

---

**Last Updated:** 2024  
**Version:** 1.0


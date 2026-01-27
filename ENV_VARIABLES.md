# Environment Variables

Copy this example to `.env.local` and fill in your values:

```bash
# Fee Wallet (Required)
# Your fee wallet address where swap fees will be sent
NEXT_PUBLIC_FEE_WALLET=your_fee_wallet_address_here

# Rewards Payout Key (Required)
# WARNING: This is exposed to the browser. Use a dedicated rewards wallet.
# Private key for the wallet that will send UCHAIN rewards to users
# Format: 0x followed by 64 hex characters (66 characters total)
NEXT_PUBLIC_REWARDS_PAYOUT_KEY=your_rewards_payout_private_key_here

# WalletConnect Project ID (Optional)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id

# Admin Private Key (Optional - for scripts only)
# Only used in admin scripts, not exposed to browser
ADMIN_PRIVATE_KEY=your_admin_private_key_here
```

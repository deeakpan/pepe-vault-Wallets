"use client"

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="glass-card p-8 md:p-12 space-y-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold gradient-text mb-4">Privacy Policy</h1>
            <div className="w-20 h-1 bg-green-500 mx-auto"></div>
          </div>

          <div className="space-y-6 text-gray-300 leading-relaxed">
            <div className="prose prose-invert max-w-none">
              <p className="text-lg md:text-xl text-white font-medium">
                Unchained Wallet does not collect, store, or share any personal user data. All wallet information, including keys, seed phrases, and settings, is stored locally on your device and encrypted for your security. We do not track your activity or access your assets. Your privacy is fully protected.
              </p>
            </div>

            <div className="pt-8 border-t border-white/10 space-y-4">
              <h2 className="text-xl font-semibold text-green-400">Key Privacy Principles</h2>
              <ul className="space-y-3 list-none">
                <li className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  <span><strong className="text-white">No Data Collection:</strong> We do not collect any personal information, transaction data, or usage statistics.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  <span><strong className="text-white">Local Storage Only:</strong> All wallet data, including private keys and seed phrases, is stored exclusively on your device using browser localStorage.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  <span><strong className="text-white">End-to-End Encryption:</strong> Your sensitive data is encrypted using AES encryption before being stored locally.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  <span><strong className="text-white">No Tracking:</strong> We do not use analytics, cookies, or any tracking mechanisms to monitor your activity.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  <span><strong className="text-white">No Third-Party Sharing:</strong> We do not share, sell, or disclose your information to any third parties.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  <span><strong className="text-white">Non-Custodial:</strong> You have complete control over your assets. We cannot access your funds or private keys.</span>
                </li>
              </ul>
            </div>

            <div className="pt-6 border-t border-white/10">
              <p className="text-sm text-gray-400">
                Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


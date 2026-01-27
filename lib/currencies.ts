// Supported currencies for balance display
export interface Currency {
  code: string
  name: string
  symbol: string
}

export const CURRENCIES: Currency[] = [
  { code: "usd", name: "US Dollar", symbol: "$" },
  { code: "eur", name: "Euro", symbol: "€" },
  { code: "gbp", name: "British Pound", symbol: "£" },
  { code: "jpy", name: "Japanese Yen", symbol: "¥" },
  { code: "cny", name: "Chinese Yuan", symbol: "¥" },
  { code: "inr", name: "Indian Rupee", symbol: "₹" },
  { code: "krw", name: "South Korean Won", symbol: "₩" },
  { code: "cad", name: "Canadian Dollar", symbol: "C$" },
  { code: "aud", name: "Australian Dollar", symbol: "A$" },
  { code: "chf", name: "Swiss Franc", symbol: "CHF" },
  { code: "nzd", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "sgd", name: "Singapore Dollar", symbol: "S$" },
  { code: "hkd", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "sek", name: "Swedish Krona", symbol: "kr" },
  { code: "nok", name: "Norwegian Krone", symbol: "kr" },
  { code: "dkk", name: "Danish Krone", symbol: "kr" },
  { code: "pln", name: "Polish Zloty", symbol: "zł" },
  { code: "czk", name: "Czech Koruna", symbol: "Kč" },
  { code: "huf", name: "Hungarian Forint", symbol: "Ft" },
  { code: "rub", name: "Russian Ruble", symbol: "₽" },
  { code: "try", name: "Turkish Lira", symbol: "₺" },
  { code: "brl", name: "Brazilian Real", symbol: "R$" },
  { code: "mxn", name: "Mexican Peso", symbol: "$" },
  { code: "ars", name: "Argentine Peso", symbol: "$" },
  { code: "clp", name: "Chilean Peso", symbol: "$" },
  { code: "cop", name: "Colombian Peso", symbol: "$" },
  { code: "pen", name: "Peruvian Sol", symbol: "S/" },
  { code: "zar", name: "South African Rand", symbol: "R" },
  { code: "ngn", name: "Nigerian Naira", symbol: "₦" },
  { code: "egp", name: "Egyptian Pound", symbol: "£" },
  { code: "aed", name: "UAE Dirham", symbol: "د.إ" },
  { code: "sar", name: "Saudi Riyal", symbol: "﷼" },
  { code: "ils", name: "Israeli Shekel", symbol: "₪" },
  { code: "thb", name: "Thai Baht", symbol: "฿" },
  { code: "myr", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "idr", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "php", name: "Philippine Peso", symbol: "₱" },
  { code: "vnd", name: "Vietnamese Dong", symbol: "₫" },
  { code: "twd", name: "Taiwan Dollar", symbol: "NT$" },
  { code: "pkr", name: "Pakistani Rupee", symbol: "₨" },
  { code: "bdt", name: "Bangladeshi Taka", symbol: "৳" },
  { code: "lkr", name: "Sri Lankan Rupee", symbol: "Rs" },
  { code: "npr", name: "Nepalese Rupee", symbol: "₨" },
  { code: "mmk", name: "Myanmar Kyat", symbol: "K" },
  { code: "khr", name: "Cambodian Riel", symbol: "៛" },
  { code: "lak", name: "Lao Kip", symbol: "₭" },
  { code: "bnd", name: "Brunei Dollar", symbol: "B$" },
  { code: "fjd", name: "Fijian Dollar", symbol: "FJ$" },
  { code: "xpf", name: "CFP Franc", symbol: "₣" },
  { code: "xof", name: "West African CFA Franc", symbol: "Fr" },
  { code: "mad", name: "Moroccan Dirham", symbol: "د.م." },
  { code: "tnd", name: "Tunisian Dinar", symbol: "د.ت" },
  { code: "dzd", name: "Algerian Dinar", symbol: "د.ج" },
  { code: "lyd", name: "Libyan Dinar", symbol: "ل.د" },
  { code: "kes", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "ugx", name: "Ugandan Shilling", symbol: "USh" },
  { code: "tzs", name: "Tanzanian Shilling", symbol: "TSh" },
  { code: "etb", name: "Ethiopian Birr", symbol: "Br" },
  { code: "ghs", name: "Ghanaian Cedi", symbol: "₵" },
  { code: "bwp", name: "Botswana Pula", symbol: "P" },
  { code: "zmw", name: "Zambian Kwacha", symbol: "ZK" },
  { code: "mwk", name: "Malawian Kwacha", symbol: "MK" },
  { code: "mzn", name: "Mozambican Metical", symbol: "MT" },
  { code: "aoa", name: "Angolan Kwanza", symbol: "Kz" },
  { code: "bif", name: "Burundian Franc", symbol: "Fr" },
  { code: "rwf", name: "Rwandan Franc", symbol: "Fr" },
  { code: "djf", name: "Djiboutian Franc", symbol: "Fr" },
  { code: "sos", name: "Somali Shilling", symbol: "Sh" },
  { code: "ern", name: "Eritrean Nakfa", symbol: "Nfk" },
  { code: "sdg", name: "Sudanese Pound", symbol: "ج.س." },
  { code: "ssp", name: "South Sudanese Pound", symbol: "£" },
  { code: "cdf", name: "Congolese Franc", symbol: "Fr" },
  { code: "gmd", name: "Gambian Dalasi", symbol: "D" },
  { code: "gnf", name: "Guinean Franc", symbol: "Fr" },
  { code: "sll", name: "Sierra Leonean Leone", symbol: "Le" },
  { code: "lrd", name: "Liberian Dollar", symbol: "$" },
  { code: "cve", name: "Cape Verdean Escudo", symbol: "Esc" },
  { code: "stn", name: "São Tomé and Príncipe Dobra", symbol: "Db" },
  { code: "xaf", name: "Central African CFA Franc", symbol: "Fr" },
  { code: "ron", name: "Romanian Leu", symbol: "lei" },
  { code: "bgn", name: "Bulgarian Lev", symbol: "лв" },
  { code: "hrk", name: "Croatian Kuna", symbol: "kn" },
  { code: "rsd", name: "Serbian Dinar", symbol: "дин." },
  { code: "bam", name: "Bosnia-Herzegovina Mark", symbol: "KM" },
  { code: "mkd", name: "Macedonian Denar", symbol: "ден" },
  { code: "all", name: "Albanian Lek", symbol: "L" },
  { code: "isk", name: "Icelandic Króna", symbol: "kr" },
  { code: "uah", name: "Ukrainian Hryvnia", symbol: "₴" },
  { code: "byn", name: "Belarusian Ruble", symbol: "Br" },
  { code: "kzt", name: "Kazakhstani Tenge", symbol: "₸" },
  { code: "uzs", name: "Uzbekistani Som", symbol: "so'm" },
  { code: "kgs", name: "Kyrgystani Som", symbol: "с" },
  { code: "tjs", name: "Tajikistani Somoni", symbol: "ЅМ" },
  { code: "tmt", name: "Turkmenistani Manat", symbol: "m" },
  { code: "amd", name: "Armenian Dram", symbol: "֏" },
  { code: "gel", name: "Georgian Lari", symbol: "₾" },
  { code: "azn", name: "Azerbaijani Manat", symbol: "₼" },
]

// Get currency by code
export function getCurrency(code: string): Currency | undefined {
  return CURRENCIES.find((c) => c.code.toLowerCase() === code.toLowerCase())
}

// Get default currency (USD)
export function getDefaultCurrency(): Currency {
  return CURRENCIES[0] // USD
}

// Get saved currency from localStorage
export function getSavedCurrency(): Currency {
  if (typeof window === "undefined") return getDefaultCurrency()
  const saved = localStorage.getItem("display_currency")
  if (saved) {
    const currency = getCurrency(saved)
    if (currency) return currency
  }
  return getDefaultCurrency()
}

// Save currency to localStorage
export function saveCurrency(currency: Currency): void {
  if (typeof window === "undefined") return
  localStorage.setItem("display_currency", currency.code.toLowerCase())
}


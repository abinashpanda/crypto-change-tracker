import { groupBy, orderBy, round } from 'lodash'
import axios from 'axios'
import Table from 'cli-table3'
import colors from '@colors/colors'
import data from './data/portfolio.json'

const API_BASE_URL = 'https://api.coingecko.com/api/v3'
const apiClient = axios.create({
  baseURL: API_BASE_URL,
})

type CoinInfo = {
  id: string
  symbol: string
  name: string
}

async function fetchCoinsList() {
  const { data } = await apiClient.get<CoinInfo[]>('/coins/list')
  return data
}

type CoinPrice = {
  inr: number
  usd: number
}

async function fetchCoinsPrice(coins: string[]) {
  const { data } = await apiClient.get<{ [key: string]: CoinPrice }>('/simple/price', {
    params: {
      ids: coins.join(','),
      vs_currencies: 'inr,usd',
    },
  })
  return data
}

type PortfolioResult = {
  symbol: string
  name: string
  profit: number
  profitPercentage: number
  initialPortfolioValue: number
  currentPortfolioValue: number
}

async function main() {
  const allCoins = await fetchCoinsList()

  const coinTradeGroups = groupBy(data, (item) => item.coin)
  const allMyCoins = Object.keys(coinTradeGroups)
  const allMyCoinsIds = allMyCoins
    .map(
      (coinSymbol) =>
        allCoins.find((coin) => coin.symbol.toLowerCase() === coinSymbol.toLowerCase() && !coin.name.match(/peg/i))?.id,
    )
    .filter(Boolean) as string[]
  const allMyCoinsPrices = await fetchCoinsPrice(allMyCoinsIds)

  let portfolioResult: PortfolioResult[] = []

  for (const [coinSymbol, orders] of Object.entries(coinTradeGroups)) {
    const coin = allCoins.find(
      (coin) => coin.symbol.toLowerCase() === coinSymbol.toLowerCase() && !coin.name.match(/peg/i),
    )
    if (!coin) {
      console.log(colors.red(`Coin ${coinSymbol} not found`))
      continue
    }

    const { id } = coin
    const coinPrice = allMyCoinsPrices[id]
    if (!coinPrice) {
      console.log(colors.red(`Coin price for ${coinSymbol} not found`))
      continue
    }

    const { inr: currentCoinPriceInInr } = coinPrice
    const coinsLeft = orders.reduce((acc, { amount, type }) => {
      return acc + (type === 'BUY' ? amount : -amount)
    }, 0)
    const coinPortfolioValue = orders.reduce((acc, { amount, type, price: unitPrice }) => {
      const price = amount * unitPrice
      return acc + (type === 'BUY' ? price : -price)
    }, 0)
    const currentPortfolioValue = currentCoinPriceInInr * coinsLeft
    const netProfit = currentPortfolioValue - coinPortfolioValue
    const netProfitPercentage = (netProfit / coinPortfolioValue) * 100
    portfolioResult.push({
      symbol: coinSymbol,
      name: coin.name,
      initialPortfolioValue: coinPortfolioValue,
      currentPortfolioValue,
      profit: netProfit,
      profitPercentage: netProfitPercentage,
    })
  }

  portfolioResult = orderBy(portfolioResult, (result) => result.profitPercentage, 'desc')

  const table = new Table({
    head: ['COIN', 'NAME', 'INITIAL HOLDING (INR)', 'CURRENT HOLDING (INR)', 'PROFIT (INR)', 'PROFIT %'],
  })
  portfolioResult.forEach((result) => {
    const profit = round(result.profit, 2)
    const profitPercentage = round(result.profitPercentage, 2)
    table.push([
      result.symbol,
      result.name,
      result.initialPortfolioValue.toFixed(2),
      result.currentPortfolioValue.toFixed(2),
      profit >= 0 ? colors.green(`↑ ${profit.toString()}`) : colors.red(`↓ ${profit.toString()}`),
      profitPercentage >= 0 ? colors.green(`↑ ${profitPercentage}%`) : colors.red(`↓ ${profitPercentage}%`),
    ])
  })
  console.log(table.toString())

  const totalProfit = round(
    portfolioResult.reduce((acc, result) => acc + result.profit, 0),
    2,
  )
  let totalProfitString = `${totalProfit >= 0 ? '↑' : '↓'} ₹ ${totalProfit}`
  totalProfitString = totalProfit >= 0 ? colors.green(totalProfitString) : colors.red(totalProfitString)
  console.log(`Net Profit/Loss - ${totalProfitString}`)
}

main()

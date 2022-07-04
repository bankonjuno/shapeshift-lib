import { ethereum } from '@shapeshiftoss/chain-adapters'
import { HDWallet } from '@shapeshiftoss/hdwallet-core'
import Web3 from 'web3'

import { SwapperType } from '../../api'
import { BTC, ETH, FOX, WBTC, WETH } from '../utils/test-data/assets'
import { setupBuildTrade, setupQuote } from '../utils/test-data/setupSwapQuote'
import { cowApprovalNeeded } from './cowApprovalNeeded/cowApprovalNeeded'
import { cowApproveInfinite } from './cowApproveInfinite/cowApproveInfinite'
import { CowSwapper, CowSwapperDeps } from './CowSwapper'
import { getCowSwapTradeQuote } from './getCowSwapTradeQuote/getCowSwapTradeQuote'
import { getUsdRate } from './utils/helpers/helpers'

jest.mock('./utils/helpers/helpers')

jest.mock('./cowApprovalNeeded/cowApprovalNeeded', () => ({
  cowApprovalNeeded: jest.fn()
}))

jest.mock('./cowApproveInfinite/cowApproveInfinite', () => ({
  cowApproveInfinite: jest.fn()
}))

const COW_SWAPPER_DEPS: CowSwapperDeps = {
  apiUrl: 'https://api.cow.fi/mainnet/api/',
  adapter: {} as ethereum.ChainAdapter,
  web3: {} as Web3,
  feeAsset: WETH
}

jest.mock('./getCowSwapTradeQuote/getCowSwapTradeQuote', () => ({
  getCowSwapTradeQuote: jest.fn()
}))

jest.mock('./CowBuildTrade/CowBuildTrade', () => ({
  CowBuildTrade: jest.fn()
}))

const ASSET_IDS = [ETH.assetId, WBTC.assetId, WETH.assetId, BTC.assetId, FOX.assetId]

describe('CowSwapper', () => {
  const wallet = <HDWallet>{}
  const swapper = new CowSwapper(COW_SWAPPER_DEPS)

  describe('static properties', () => {
    it('returns the correct swapper name', async () => {
      expect(CowSwapper.swapperName).toEqual('CowSwapper')
    })
  })

  describe('getType', () => {
    it('returns the correct type for CowSwapper', async () => {
      await expect(swapper.getType()).toEqual(SwapperType.CowSwap)
    })
  })

  describe('getUsdRate', () => {
    it('calls getUsdRate on swapper.getUsdRate', async () => {
      await swapper.getUsdRate(FOX)
      expect(getUsdRate).toHaveBeenCalledWith(COW_SWAPPER_DEPS, FOX)
    })
  })

  describe('filterAssetIdsBySellable', () => {
    it('returns empty array when called with an empty array', async () => {
      expect(await swapper.filterAssetIdsBySellable([])).toEqual([])
    })

    it('returns array filtered out of non erc20 tokens', async () => {
      expect(await swapper.filterAssetIdsBySellable(ASSET_IDS)).toEqual([
        WBTC.assetId,
        WETH.assetId,
        FOX.assetId
      ])
    })

    it('returns array filtered out of unsupported tokens', async () => {
      const assetIds = [FOX.assetId, 'eip155:1/erc20:0xdc49108ce5c57bc3408c3a5e95f3d864ec386ed3']
      expect(await swapper.filterAssetIdsBySellable(assetIds)).toEqual([FOX.assetId])
    })
  })

  describe('filterBuyAssetsBySellAssetId', () => {
    it('returns empty array when called with an empty assetIds array', async () => {
      expect(
        await swapper.filterBuyAssetsBySellAssetId({ assetIds: [], sellAssetId: WETH.assetId })
      ).toEqual([])
    })

    it('returns empty array when called with sellAssetId that is not sellable', async () => {
      expect(
        await swapper.filterBuyAssetsBySellAssetId({
          assetIds: ASSET_IDS,
          sellAssetId: ETH.assetId
        })
      ).toEqual([])
      expect(
        await swapper.filterBuyAssetsBySellAssetId({
          assetIds: ASSET_IDS,
          sellAssetId: 'eip155:1/erc20:0xdc49108ce5c57bc3408c3a5e95f3d864ec386ed3'
        })
      ).toEqual([])
    })

    it('returns array filtered out of non erc20 tokens when called with a sellable sellAssetId', async () => {
      expect(
        await swapper.filterBuyAssetsBySellAssetId({
          assetIds: ASSET_IDS,
          sellAssetId: WETH.assetId
        })
      ).toEqual([WBTC.assetId, FOX.assetId])
      expect(
        await swapper.filterBuyAssetsBySellAssetId({
          assetIds: ASSET_IDS,
          sellAssetId: WBTC.assetId
        })
      ).toEqual([WETH.assetId, FOX.assetId])
      expect(
        await swapper.filterBuyAssetsBySellAssetId({
          assetIds: ASSET_IDS,
          sellAssetId: FOX.assetId
        })
      ).toEqual([WBTC.assetId, WETH.assetId])
    })

    it('returns array filtered out of unsupported tokens when called with a sellable sellAssetId', async () => {
      const assetIds = [FOX.assetId, 'eip155:1/erc20:0xdc49108ce5c57bc3408c3a5e95f3d864ec386ed3']
      expect(
        await swapper.filterBuyAssetsBySellAssetId({
          assetIds,
          sellAssetId: WETH.assetId
        })
      ).toEqual([FOX.assetId])
      expect(
        await swapper.filterBuyAssetsBySellAssetId({ assetIds, sellAssetId: FOX.assetId })
      ).toEqual([])
    })
  })

  describe('getTradeQuote', () => {
    it('calls getCowSwapTradeQuote on swapper.getTradeQuote', async () => {
      const { quoteInput } = setupQuote()
      await swapper.getTradeQuote(quoteInput)
      expect(getCowSwapTradeQuote).toHaveBeenCalledTimes(1)
      expect(getCowSwapTradeQuote).toHaveBeenCalledWith(COW_SWAPPER_DEPS, quoteInput)
    })
  })

  describe('buildTrade', () => {
    it('calls CowBuildTrade on swapper.buildTrade', async () => {
      const { buildTradeInput } = setupBuildTrade()
      const args = { ...buildTradeInput, wallet }
      await swapper.buildTrade(args)
      expect(CowBuildTrade).toHaveBeenCalledTimes(1)
      expect(CowBuildTrade).toHaveBeenCalledWith(COW_SWAPPER_DEPS, args)
    })
  })

  describe('cowApprovalNeeded', () => {
    it('calls cowApprovalNeeded on swapper.approvalNeeded', async () => {
      const { tradeQuote } = setupQuote()
      const args = { quote: tradeQuote, wallet }
      await swapper.approvalNeeded(args)
      expect(cowApprovalNeeded).toHaveBeenCalledTimes(1)
      expect(cowApprovalNeeded).toHaveBeenCalledWith(COW_SWAPPER_DEPS, args)
    })
  })

  describe('cowApproveInfinite', () => {
    it('calls cowApproveInfinite on swapper.approveInfinite', async () => {
      const { tradeQuote } = setupQuote()
      const args = { quote: tradeQuote, wallet }
      await swapper.approveInfinite(args)
      expect(cowApproveInfinite).toHaveBeenCalledTimes(1)
      expect(cowApproveInfinite).toHaveBeenCalledWith(COW_SWAPPER_DEPS, args)
    })
  })
})

import { fromAssetId } from '@shapeshiftoss/caip'
import { ethereum } from '@shapeshiftoss/chain-adapters'
import { HDWallet } from '@shapeshiftoss/hdwallet-core'
import { Asset } from '@shapeshiftoss/types'
import BigNumber from 'bignumber.js'
import Web3 from 'web3'
import { AbiItem, numberToHex } from 'web3-utils'

import { SwapError, SwapErrorTypes, TradeQuote } from '../../../api'
import { BN, bn, bnOrZero } from '../bignumber'

export type GetAllowanceRequiredArgs = {
  receiveAddress: string
  allowanceContract: string
  sellAsset: Asset
  sellAmount: string
  web3: Web3
  erc20AllowanceAbi: AbiItem[]
}

export type GetERC20AllowanceArgs = {
  erc20AllowanceAbi: AbiItem[]
  web3: Web3
  sellAssetErc20Address: string
  ownerAddress: string
  spenderAddress: string
}

type GrantAllowanceArgs = {
  quote: TradeQuote<'eip155:1'>
  wallet: HDWallet
  adapter: ethereum.ChainAdapter
  erc20Abi: AbiItem[]
  web3: Web3
}

export const getERC20Allowance = async ({
  erc20AllowanceAbi,
  web3,
  sellAssetErc20Address,
  ownerAddress,
  spenderAddress
}: GetERC20AllowanceArgs) => {
  const erc20Contract = new web3.eth.Contract(erc20AllowanceAbi, sellAssetErc20Address)
  return erc20Contract.methods.allowance(ownerAddress, spenderAddress).call()
}

export const getAllowanceRequired = async ({
  receiveAddress,
  allowanceContract,
  sellAsset,
  sellAmount,
  web3,
  erc20AllowanceAbi
}: GetAllowanceRequiredArgs): Promise<BigNumber> => {
  try {
    if (sellAsset.assetId === 'eip155:1/slip44:60') {
      return bn(0)
    }

    const ownerAddress = receiveAddress
    const spenderAddress = allowanceContract

    const { assetReference: sellAssetErc20Address } = fromAssetId(sellAsset.assetId)

    const allowanceOnChain = await getERC20Allowance({
      web3,
      erc20AllowanceAbi,
      ownerAddress,
      spenderAddress,
      sellAssetErc20Address
    })
    if (allowanceOnChain === '0') return bnOrZero(sellAmount)
    if (!allowanceOnChain) {
      throw new SwapError(`[getAllowanceRequired] - No allowance data`, {
        details: { allowanceContract, receiveAddress },
        code: SwapErrorTypes.RESPONSE_ERROR
      })
    }
    const allowanceRequired = bnOrZero(sellAmount).minus(allowanceOnChain)
    return allowanceRequired.lt(0) ? bn(0) : allowanceRequired
  } catch (e) {
    if (e instanceof SwapError) throw e
    throw new SwapError('[getAllowanceRequired]', {
      cause: e,
      code: SwapErrorTypes.ALLOWANCE_REQUIRED_FAILED
    })
  }
}

export const grantAllowance = async ({
  quote,
  wallet,
  adapter,
  erc20Abi,
  web3
}: GrantAllowanceArgs): Promise<string> => {
  try {
    const { assetReference: sellAssetErc20Address } = fromAssetId(quote.sellAsset.assetId)

    const erc20Contract = new web3.eth.Contract(erc20Abi, sellAssetErc20Address)
    const approveTx = erc20Contract.methods
      .approve(quote.allowanceContract, quote.sellAmount)
      .encodeABI()

    const accountNumber = quote.sellAssetAccountNumber
    const bip44Params = adapter.buildBIP44Params({ accountNumber })

    const { txToSign } = await adapter.buildSendTransaction({
      wallet,
      to: sellAssetErc20Address,
      bip44Params,
      value: '0',
      chainSpecific: {
        erc20ContractAddress: sellAssetErc20Address,
        gasPrice: numberToHex(
          (quote as TradeQuote<'eip155:1'>).feeData?.chainSpecific?.gasPrice || 0
        ),
        gasLimit: numberToHex(
          (quote as TradeQuote<'eip155:1'>).feeData?.chainSpecific?.estimatedGas || 0
        )
      }
    })

    const grantAllowanceTxToSign = {
      ...txToSign,
      data: approveTx
    }
    if (wallet.supportsOfflineSigning()) {
      const signedTx = await adapter.signTransaction({ txToSign: grantAllowanceTxToSign, wallet })

      const broadcastedTxId = await adapter.broadcastTransaction(signedTx)

      return broadcastedTxId
    } else if (wallet.supportsBroadcast() && adapter.signAndBroadcastTransaction) {
      const broadcastedTxId = await adapter.signAndBroadcastTransaction?.({
        txToSign: grantAllowanceTxToSign,
        wallet
      })

      return broadcastedTxId
    } else {
      throw new SwapError('[grantAllowance] - invalid HDWallet config', {
        code: SwapErrorTypes.SIGN_AND_BROADCAST_FAILED
      })
    }
  } catch (e) {
    if (e instanceof SwapError) throw e
    throw new SwapError('[grantAllowance]', {
      cause: e,
      code: SwapErrorTypes.GRANT_ALLOWANCE_FAILED
    })
  }
}

/**
 * This function keeps 17 significant digits, so even if we try to trade 1 Billion of an
 * ETH or ERC20, we still keep 7 decimal places.
 * @param amount
 */
export const normalizeAmount = (amount: string | number | BN): string => {
  return bnOrZero(amount).toNumber().toLocaleString('fullwide', { useGrouping: false })
}

export const normalizeIntegerAmount = (amount: string | number | BN): string => {
  return bnOrZero(amount)
    .integerValue()
    .toNumber()
    .toLocaleString('fullwide', { useGrouping: false })
}

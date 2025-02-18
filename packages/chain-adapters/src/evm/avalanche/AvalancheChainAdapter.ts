import {
  ASSET_REFERENCE,
  AssetId,
  avalancheAssetId,
  avalancheChainId,
  fromAssetId
} from '@shapeshiftoss/caip'
import { bip32ToAddressNList, ETHSignTx } from '@shapeshiftoss/hdwallet-core'
import { BIP44Params, KnownChainIds } from '@shapeshiftoss/types'
import * as unchained from '@shapeshiftoss/unchained-client'
import BigNumber from 'bignumber.js'
import { numberToHex } from 'web3-utils'

import { ErrorHandler } from '../../error/ErrorHandler'
import { BuildSendTxInput, FeeDataEstimate, GasFeeDataEstimate, GetFeeDataInput } from '../../types'
import { toPath } from '../../utils'
import { bn, bnOrZero } from '../../utils/bignumber'
import { ChainAdapterArgs, EVMBaseAdapter } from '../EVMBaseAdapter'
import { Fees } from '../types'
import { getErc20Data } from '../utils'

const SUPPORTED_CHAIN_IDS = [avalancheChainId]
const DEFAULT_CHAIN_ID = avalancheChainId

export class ChainAdapter extends EVMBaseAdapter<KnownChainIds.AvalancheMainnet> {
  public static readonly defaultBIP44Params: BIP44Params = {
    purpose: 44,
    coinType: Number(ASSET_REFERENCE.AvalancheC),
    accountNumber: 0
  }

  constructor(args: ChainAdapterArgs) {
    super({ chainId: DEFAULT_CHAIN_ID, supportedChainIds: SUPPORTED_CHAIN_IDS, ...args })

    this.assetId = avalancheAssetId
    this.parser = new unchained.ethereum.TransactionParser({
      chainId: this.chainId,
      rpcUrl: this.rpcUrl
    })
  }

  getType(): KnownChainIds.AvalancheMainnet {
    return KnownChainIds.AvalancheMainnet
  }

  getFeeAssetId(): AssetId {
    return this.assetId
  }

  async buildSendTransaction(tx: BuildSendTxInput<KnownChainIds.AvalancheMainnet>): Promise<{
    txToSign: ETHSignTx
  }> {
    try {
      const { to, wallet, bip44Params = ChainAdapter.defaultBIP44Params, sendMax = false } = tx
      const { erc20ContractAddress, gasPrice, gasLimit, maxFeePerGas, maxPriorityFeePerGas } =
        tx.chainSpecific

      if (!tx.to) throw new Error('AvalancheChainAdapter: to is required')
      if (!tx.value) throw new Error('AvalancheChainAdapter: value is required')

      const destAddress = erc20ContractAddress ?? to

      const from = await this.getAddress({ bip44Params, wallet })
      const account = await this.getAccount(from)

      const isErc20Send = !!erc20ContractAddress

      if (sendMax) {
        if (isErc20Send) {
          const erc20Balance = account?.chainSpecific?.tokens?.find((token) => {
            return fromAssetId(token.assetId).assetReference === erc20ContractAddress.toLowerCase()
          })?.balance
          if (!erc20Balance) throw new Error('no balance')
          tx.value = erc20Balance
        } else {
          if (bnOrZero(account.balance).isZero()) throw new Error('no balance')

          // (The type system guarantees that either maxFeePerGas or gasPrice will be undefined, but not both)
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const fee = bnOrZero((maxFeePerGas ?? gasPrice)!).times(bnOrZero(gasLimit))
          tx.value = bnOrZero(account.balance).minus(fee).toString()
        }
      }
      const data = await getErc20Data(to, tx?.value, erc20ContractAddress)

      const fees = ((): Fees => {
        if (maxFeePerGas && maxPriorityFeePerGas) {
          return {
            maxFeePerGas: numberToHex(maxFeePerGas),
            maxPriorityFeePerGas: numberToHex(maxPriorityFeePerGas)
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return { gasPrice: numberToHex(tx.chainSpecific.gasPrice!) }
      })()

      const txToSign: ETHSignTx = {
        addressNList: bip32ToAddressNList(toPath(bip44Params)),
        value: numberToHex(isErc20Send ? '0' : tx?.value),
        to: destAddress,
        chainId: 43114, // TODO: implement for multiple chains
        data,
        nonce: numberToHex(account.chainSpecific.nonce),
        gasLimit: numberToHex(gasLimit),
        ...fees
      }
      return { txToSign }
    } catch (err) {
      return ErrorHandler(err)
    }
  }

  async getGasFeeData(): Promise<GasFeeDataEstimate> {
    const feeData = (await this.providers.http.getGasFees()).data

    const normalizationConstants = {
      fast: bn(1.2),
      average: bn(1),
      slow: bn(0.8)
    }

    const calcFee = (
      fee: string | number | BigNumber,
      speed: 'slow' | 'average' | 'fast'
    ): string => {
      return bnOrZero(fee)
        .times(normalizationConstants[speed])
        .toFixed(0, BigNumber.ROUND_CEIL)
        .toString()
    }

    return {
      fast: {
        gasPrice: calcFee(feeData.gasPrice, 'fast'),
        maxFeePerGas: calcFee(feeData.maxFeePerGas, 'fast'),
        maxPriorityFeePerGas: calcFee(feeData.maxPriorityFeePerGas, 'fast')
      },
      average: {
        gasPrice: calcFee(feeData.gasPrice, 'average'),
        maxFeePerGas: calcFee(feeData.maxFeePerGas, 'average'),
        maxPriorityFeePerGas: calcFee(feeData.maxPriorityFeePerGas, 'average')
      },
      slow: {
        gasPrice: calcFee(feeData.gasPrice, 'slow'),
        maxFeePerGas: calcFee(feeData.maxFeePerGas, 'slow'),
        maxPriorityFeePerGas: calcFee(feeData.maxPriorityFeePerGas, 'slow')
      }
    }
  }

  async getFeeData({
    to,
    value,
    chainSpecific: { contractAddress, from, contractData },
    sendMax = false
  }: GetFeeDataInput<KnownChainIds.AvalancheMainnet>): Promise<
    FeeDataEstimate<KnownChainIds.AvalancheMainnet>
  > {
    const isErc20Send = !!contractAddress

    // get the exact send max value for an erc20 send to ensure we have the correct input data when estimating fees
    if (sendMax && isErc20Send) {
      const account = await this.getAccount(from)
      const erc20Balance = account.chainSpecific.tokens?.find((token) => {
        const { assetReference } = fromAssetId(token.assetId)
        return assetReference === contractAddress.toLowerCase()
      })?.balance

      if (!erc20Balance) throw new Error('no balance')

      value = erc20Balance
    }

    const data = contractData ?? (await getErc20Data(to, value, contractAddress))

    const { data: gasLimit } = await this.providers.http.estimateGas({
      from,
      to: isErc20Send ? contractAddress : to,
      value: isErc20Send ? '0' : value,
      data
    })

    const gasResults = await this.getGasFeeData()

    return {
      fast: {
        txFee: bnOrZero(bn(gasResults.fast.gasPrice).times(gasLimit)).toPrecision(),
        chainSpecific: { gasLimit, ...gasResults.fast }
      },
      average: {
        txFee: bnOrZero(bn(gasResults.average.gasPrice).times(gasLimit)).toPrecision(),
        chainSpecific: { gasLimit, ...gasResults.average }
      },
      slow: {
        txFee: bnOrZero(bn(gasResults.slow.gasPrice).times(gasLimit)).toPrecision(),
        chainSpecific: { gasLimit, ...gasResults.slow }
      }
    }
  }
}

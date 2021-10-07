// Allow explicit any since this is a test file
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Test BitcoinChainAdapter
 * @group unit
 */
import { ChainAdapterManager } from '../ChainAdapterManager'
import { BTCInputScriptType, BTCSignTx } from '@shapeshiftoss/hdwallet-core'
import { BuildSendTxInput, FeeData, GetAddressParams, SignBitcoinTxInput } from '../api'
import { ChainAdapter, ChainIdentifier } from '../'
import { NativeAdapterArgs, NativeHDWallet } from '@shapeshiftoss/hdwallet-native'
import { Bitcoin } from '@shapeshiftoss/unchained-client'
import dotenv from 'dotenv'
dotenv.config({
  path: __dirname + '/../../.env'
})

const defaultEthPath = `m/44'/60'/0'/0/0`
const defaultBtcPath = `m/44'/0'/0'/0/0`
const unchainedUrls = {
  [ChainIdentifier.Bitcoin]: 'http://localhost:31300',
  [ChainIdentifier.Ethereum]: 'http://localhost:31300'
}

let chainAdapterManager: ChainAdapterManager
let wallet: NativeHDWallet
let btcChainAdapter: ChainAdapter
let address: string

const getWallet = async (): Promise<NativeHDWallet> => {
  console.log('process.env.CLI_MNEMONIC: ', process.env.CLI_MNEMONIC)
  const nativeAdapterArgs: NativeAdapterArgs = {
    mnemonic: process.env.CLI_MNEMONIC,
    deviceId: 'test'
  }
  wallet = new NativeHDWallet(nativeAdapterArgs)
  await wallet.initialize()

  return wallet
}

describe('BitcoinChainAdapter', () => {
  beforeAll(async () => {
    try {
      chainAdapterManager = new ChainAdapterManager(unchainedUrls)
    } catch (error) {
      console.log(
        'Could not instantiate new ChainAdapterManager. Is an Unchained instance running at either ',
        unchainedUrls
      )
    }
    wallet = await getWallet()
    btcChainAdapter = chainAdapterManager.byChain(ChainIdentifier.Bitcoin)
    const getAddressParams: GetAddressParams = {
      wallet,
      purpose: 44,
      account: 0,
      isChange: false,
      scriptType: BTCInputScriptType.SpendAddress
    }
    address = (await btcChainAdapter.getAddress(getAddressParams)) || ''
  })

  describe('getType', () => {
    it('should return ChainIdentifier.Bitcoin', async () => {
      const type = btcChainAdapter.getType()
      expect(type).toEqual(ChainIdentifier.Bitcoin)
    })
  })

  describe('getAccount', () => {
    it('should return account info for a specified address', async () => {
      const exampleResponse: Bitcoin.BitcoinAccount = {
        pubkey: '1EjpFGTWJ9CGRJUMA3SdQSdigxM31aXAFx',
        balance: '0'
      }
      const data = await btcChainAdapter.getAccount(address)
      expect(data).toMatchObject(exampleResponse)
    })

    it('should throw for an unspecified address', async () => {
      await expect(btcChainAdapter.getAccount('')).rejects.toThrow(
        'Address parameter is not defined'
      )
    })
  })

  describe('getTxHistory', () => {
    it('should return tx history for a specified address', async () => {
      const data = await btcChainAdapter.getTxHistory('1EjpFGTWJ9CGRJUMA3SdQSdigxM31aXAFx')
      console.log(data)
    })

    it.skip('should fail for an unspecified address', async () => {
      expect(await btcChainAdapter.getTxHistory('')).rejects.toThrow(
        "Parameter 'address' is not defined"
      )
    })
  })

  describe('buildSendTransaction', () => {
    it.skip('should return a formatted BTCSignTx object for a valid BuildSendTxInput parameter', async () => {
      const txInput: BuildSendTxInput = {
        asset: { id: '123', symbol: 'BTC' },
        recipients: [
          {
            address: '1FH6ehAd5ZFXCM1cLGzHxK1s4dGdq1JusM',
            value: 2000
          }
        ],
        wallet,
        fee: '100',
        opReturnData: 'nm, u?'
      }
      console.log(JSON.stringify(txInput))
      const unsignedTx: BTCSignTx = (await btcChainAdapter.buildSendTransaction(txInput))
        ?.txToSign as BTCSignTx
      console.log(unsignedTx)
      expect(unsignedTx).toBeDefined()
    })

    it.skip('should return estimated fees for a valid BuildSendTxInput parameter', async () => {
      const txInput: BuildSendTxInput = {
        asset: { id: '123', symbol: 'BTC' },
        recipients: [
          {
            address: '1FH6ehAd5ZFXCM1cLGzHxK1s4dGdq1JusM',
            value: 2000
          }
        ],
        wallet,
        fee: '100',
        opReturnData: 'nm, u?'
      }
      const fees: FeeData = (await btcChainAdapter.buildSendTransaction(txInput))
        ?.estimatedFees as FeeData
      console.log(fees)
      expect(fees).toBeDefined()
    })
  })

  describe('signTransaction', () => {
    it.skip('should sign a properly formatted signTxInput object', async () => {
      const txInput = {
        asset: { id: '123', symbol: 'BTC' },
        recipients: [{ address: '1FH6ehAd5ZFXCM1cLGzHxK1s4dGdq1JusM', value: 2000 }],
        wallet,
        fee: '100',
        opReturnData: 'sup fool'
      }

      const unsignedTx = await btcChainAdapter.buildSendTransaction(txInput)

      const signedTx = await btcChainAdapter.signTransaction({
        wallet,
        txToSign: unsignedTx?.txToSign
      } as SignBitcoinTxInput)

      console.log(JSON.stringify(signedTx))
    })
  })

  // TODO: MockMe
  // describe('broadcastTransaction', () => {})

  describe('getFeeData', () => {
    it('should return current BTC network fees', async () => {
      const data: FeeData = await btcChainAdapter.getFeeData({})
      expect(data).toEqual(
        expect.objectContaining({
          fastest: { minMinutes: 0, maxMinutes: 35, effort: 5, fee: expect.any(Number) },
          halfHour: { minMinutes: 0, maxMinutes: 35, effort: 4, fee: expect.any(Number) },
          '1hour': { minMinutes: 0, maxMinutes: 50, effort: 3, fee: expect.any(Number) },
          '6hour': { minMinutes: 30, maxMinutes: 300, effort: 2, fee: expect.any(Number) },
          '24hour': { minMinutes: 30, maxMinutes: 660, effort: 1, fee: expect.any(Number) }
        })
      )
    })
  })

  describe('getAddress', () => {
    it("should return a p2pkh address for valid derivation root path parameters (m/44'/0'/0'/0/0)", async () => {
      const getAddressParams: GetAddressParams = {
        wallet,
        purpose: 44,
        account: 0,
        isChange: false,
        index: 0,
        scriptType: BTCInputScriptType.SpendAddress
      }
      const addr: string | undefined = await btcChainAdapter.getAddress(getAddressParams)
      expect(addr).toStrictEqual('1FH6ehAd5ZFXCM1cLGzHxK1s4dGdq1JusM')
    })

    it("should return a valid p2pkh address for the first receive index path (m/44'/0'/0'/0/1)", async () => {
      const getAddressParams: GetAddressParams = {
        wallet,
        purpose: 44,
        account: 0,
        index: 1,
        isChange: false,
        scriptType: BTCInputScriptType.SpendAddress
      }
      const addr: string | undefined = await btcChainAdapter.getAddress(getAddressParams)
      expect(addr).toStrictEqual('1Jxtem176sCXHnK7QCShoafF5VtWvMa7eq')
    })

    it("should return a valid p2pkh change address for the first receive index path (m/44'/0'/0'/1/0)", async () => {
      const getAddressParams: GetAddressParams = {
        wallet,
        purpose: 44,
        account: 0,
        index: 0,
        isChange: true,
        scriptType: BTCInputScriptType.SpendAddress
      }
      const addr: string | undefined = await btcChainAdapter.getAddress(getAddressParams)
      expect(addr).toStrictEqual('13ZD8S4qR6h4GvkAZ2ht7rpr15TFXYxGCx')
    })

    it("should return a valid p2pkh address at the 2nd account root path (m/44'/0'/1'/0/0)", async () => {
      const getAddressParams: GetAddressParams = {
        wallet,
        purpose: 44,
        account: 1,
        index: 0,
        isChange: false,
        scriptType: BTCInputScriptType.SpendAddress
      }
      const addr: string | undefined = await btcChainAdapter.getAddress(getAddressParams)
      expect(addr).toStrictEqual('1K2oFer6nGoXSPspeB5Qvt4htJvw3y31XW')
    })

    it("should return a p2wpkh address for valid derivation root path parameters (m/84'/0'/0'/0/0)", async () => {
      const getAddressParams: GetAddressParams = {
        wallet,
        purpose: 84,
        account: 0,
        isChange: false,
        index: 0,
        scriptType: BTCInputScriptType.SpendWitness
      }
      const addr: string | undefined = await btcChainAdapter.getAddress(getAddressParams)
      expect(addr).toStrictEqual('bc1qkkr2uvry034tsj4p52za2pg42ug4pxg5qfxyfa')
    })

    it("should return a valid p2wpkh address for the first receive index path (m/84'/0'/0'/0/1)", async () => {
      const getAddressParams: GetAddressParams = {
        wallet,
        purpose: 84,
        account: 0,
        index: 1,
        isChange: false,
        scriptType: BTCInputScriptType.SpendWitness
      }
      const addr: string | undefined = await btcChainAdapter.getAddress(getAddressParams)
      expect(addr).toStrictEqual('bc1qpszctuml70ulzf7f0zy5r4sg9nm65qfpgcw0uy')
    })

    it("should return a valid p2wpkh change address for the first receive index path (m/44'/0'/0'/1/0)", async () => {
      const getAddressParams: GetAddressParams = {
        wallet,
        purpose: 84,
        account: 0,
        index: 0,
        isChange: true,
        scriptType: BTCInputScriptType.SpendWitness
      }
      const addr: string | undefined = await btcChainAdapter.getAddress(getAddressParams)
      expect(addr).toStrictEqual('bc1qhazdhyg6ukkvnnlucxamjc3dmkj2zyfte0lqa9')
    })

    it("should return a valid p2wpkh address at the 2nd account root path (m/84'/0'/1'/0/0)", async () => {
      const getAddressParams: GetAddressParams = {
        wallet,
        purpose: 84,
        account: 1,
        index: 0,
        isChange: false,
        scriptType: BTCInputScriptType.SpendWitness
      }
      const addr: string | undefined = await btcChainAdapter.getAddress(getAddressParams)
      expect(addr).toStrictEqual('bc1qgawuludfvrdxfq0x55k26ydtg2hrx64jp3u6am')
    })
  })

  describe('validateAddress', () => {
    it('should return true for a valid address', async () => {
      const referenceAddress = '1EjpFGTWJ9CGRJUMA3SdQSdigxM31aXAFx'
      const expectedReturnValue = { valid: true, result: 'valid' }
      const res = await btcChainAdapter.validateAddress(referenceAddress)
      expect(res).toMatchObject(expectedReturnValue)
    })

    it('should return false for an invalid address', async () => {
      const referenceAddress = ''
      const expectedReturnValue = { valid: false, result: 'invalid' }
      const res = await btcChainAdapter.validateAddress(referenceAddress)
      expect(res).toMatchObject(expectedReturnValue)
    })
  })
})
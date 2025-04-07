import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import './App.css'

const ESCROW_CONTRACT = '0xbC18cA6620409AA97Ec85b6Cd8B9F90A8c124114'
const TCG_TOKEN_CONTRACT = '0xc27cE0A37721db61375AF30c5b2D9Ca107f73264'
const FIXED_VIDEO_URL = 'https://static-content.azuki.com/assets/alpha-deck-square.webm'

const escrowAbi = [
  'function createEscrow(address nftContract, uint256 nftID, uint256 nftAmount, uint256 animeAmountInWei) public',
  'function buyWithAnime(uint256 i) external payable',
  'function getEscrow(uint256 i) public view returns (tuple(address,address,uint256,uint256,uint256))',
  'function removeEscrow(uint256 i) public'
]

const tokenAbi = [
  'function setApprovalForAll(address operator, bool approved) external',
  'function isApprovedForAll(address owner, address operator) external view returns (bool)',
  'function uri(uint256) external view returns (string memory)',
  'function balanceOf(address account, uint256 id) external view returns (uint256)' // ✅ NEW
]

function App() {
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [escrow, setEscrow] = useState(null)
  const [tokenContract, setTokenContract] = useState(null)
  const [walletAddress, setWalletAddress] = useState('')
  const [connected, setConnected] = useState(false)
  const [listings, setListings] = useState([])
  const [nftAmount, setNftAmount] = useState('1')
  const [animePrice, setAnimePrice] = useState('')
  const [userBalance, setUserBalance] = useState(0)

  useEffect(() => {
    async function init() {
      let prov
      if (typeof window.ethereum !== 'undefined') {
        prov = new ethers.BrowserProvider(window.ethereum)
      } else {
        prov = new ethers.JsonRpcProvider('https://rpc-animechain-39xf6m45e3.t.conduit.xyz')
      }

      const escrowReadOnly = new ethers.Contract(ESCROW_CONTRACT, escrowAbi, prov)
      const tokenReadOnly = new ethers.Contract(TCG_TOKEN_CONTRACT, tokenAbi, prov)

      setProvider(prov)
      setEscrow(escrowReadOnly)
      setTokenContract(tokenReadOnly)

      if (typeof window.ethereum !== 'undefined') {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        if (accounts.length > 0) {
          const signer = await prov.getSigner()
          const userAddress = await signer.getAddress()

          setSigner(signer)
          setWalletAddress(userAddress)
          setConnected(true)

          const escrowWithSigner = escrowReadOnly.connect(signer)
          const tokenWithSigner = tokenReadOnly.connect(signer)
          setEscrow(escrowWithSigner)
          setTokenContract(tokenWithSigner)

          await fetchUserBalance(tokenWithSigner, userAddress)
        }
      }
    }

    init()
  }, [])

  useEffect(() => {
    if (escrow && tokenContract) fetchListings()
  }, [escrow, tokenContract])

  async function fetchUserBalance(contract, address) {
    if (!contract || !address) return
    try {
      const balance = await contract.balanceOf(address, 1)
      setUserBalance(Number(balance))
    } catch (err) {
      console.warn('Failed to fetch user balance:', err)
    }
  }

  async function connectWallet() {
    if (typeof window.ethereum !== 'undefined') {
      await window.ethereum.request({ method: 'eth_requestAccounts' })
      window.location.reload()
    } else {
      alert('Please install MetaMask to use this app.')
    }
  }

  function disconnectWallet() {
    setWalletAddress('')
    setConnected(false)
    setSigner(null)
    setProvider(null)
    setEscrow(null)
    setTokenContract(null)
    setUserBalance(0)
  }

  async function listNFT() {
    if (!signer || !escrow || !tokenContract) return
    const priceInWei = ethers.parseEther(animePrice)
    const approved = await tokenContract.isApprovedForAll(walletAddress, ESCROW_CONTRACT)
    if (!approved) {
      const tx = await tokenContract.setApprovalForAll(ESCROW_CONTRACT, true)
      await tx.wait()
    }

    const tx = await escrow.createEscrow(TCG_TOKEN_CONTRACT, 1, nftAmount, priceInWei)
    await tx.wait()
    await fetchListings()
    await fetchUserBalance(tokenContract, walletAddress)
  }

  async function buy(index, priceInWei) {
    if (!signer) return
    const tx = await escrow.buyWithAnime(index, { value: priceInWei })
    await tx.wait()
    await fetchListings()
    await fetchUserBalance(tokenContract, walletAddress)
  }

  async function cancelEscrow(index) {
    if (!signer) return
    const tx = await escrow.removeEscrow(index)
    await tx.wait()
    await fetchListings()
    await fetchUserBalance(tokenContract, walletAddress)
  }

  async function fetchListings() {
    const all = []

    for (let i = 0; i < 20; i++) {
      try {
        const e = await escrow.getEscrow(i)
        if (e[3].toString() === '0') continue

        const image = FIXED_VIDEO_URL

        all.push({
          index: i,
          seller: e[0],
          tokenID: e[2].toString(),
          amount: e[3].toString(),
          price: ethers.formatEther(e[4]),
          rawPrice: e[4],
          image
        })
      } catch {
        break
      }
    }

    setListings(all)
  }

  return (
    <div className="page-wrapper">
      <div className="app-container">
        <div className="header">
          <h1>Azuki TCG Deck Marketplace</h1>
        </div>

        <div className="wallet-info">
  {!connected ? (
    <button onClick={connectWallet} className="connect-btn">
      Connect Wallet
    </button>
  ) : (
    <>
      <span>{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
      <button onClick={disconnectWallet} className="disconnect-btn">
        Disconnect
      </button>
      <p>
        You own {userBalance} TCG NFT{userBalance === 1 ? '' : 's'}
      </p>
    </>
  )}
</div>


        <div className="list-nft">
          <h2>List Your TCG Deck</h2>
          <div className="form-group">
            <label>
              <div className="label-text">Amount</div>
              <input type="number" value={nftAmount} onChange={e => setNftAmount(e.target.value)} />
            </label>
            <label>
              <div className="label-text">TOTAL price for listing in ANIME</div>
              <input type="text" value={animePrice} onChange={e => setAnimePrice(e.target.value)} />
            </label>
            <button onClick={listNFT} className="list-btn">
              List
            </button>
          </div>
        </div>

        <div className="live-listings">
          <h2>Live Listings</h2>
          <button onClick={fetchListings} className="refresh-btn">🔄 Refresh</button>
          {listings.length === 0 ? (
            <p>Connect wallet to fetch</p>
          ) : (
            listings.map(listing => (
              <div key={listing.index} className="listing">
                <video
                  src={listing.image}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="listing-image"
                />
                <p><strong>ID:</strong> {listing.tokenID}</p>
                <p><strong>Amount:</strong> {listing.amount}</p>
                <p><strong>Price:</strong> {listing.price} ANIME</p>
                {connected && (
                  <button onClick={() => buy(listing.index, listing.rawPrice)} className="buy-btn">
                    Buy
                  </button>
                )}
                {connected && listing.seller.toLowerCase() === walletAddress.toLowerCase() && (
                  <button onClick={() => cancelEscrow(listing.index)} className="cancel-btn">
                    Cancel
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default App

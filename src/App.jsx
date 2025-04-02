import { useEffect, useState } from 'react'
import { ethers } from 'ethers'

// Replace with your deployed contract addresses
const ESCROW_CONTRACT = '0xbc18ca6620409aa97ec85b6cd8b9f90a8c124114'
const TCG_TOKEN_CONTRACT = '0xc27cE0A37721db61375AF30c5b2D9Ca107f73264'

const escrowAbi = [
  'function createEscrow(address nftContract, uint256 nftID, uint256 nftAmount, uint256 animeAmountInWei) public',
  'function buyWithAnime(uint256 i) external payable',
  'function getEscrow(uint256 i) public view returns (tuple(address,address,uint256,uint256,uint256))',
  'function removeEscrow(uint256 i) public'
]

const tokenAbi = [
  'function setApprovalForAll(address operator, bool approved) external',
  'function isApprovedForAll(address owner, address operator) external view returns (bool)',
  'function uri(uint256) external view returns (string memory)'
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
  const [animePrice, setAnimePrice] = useState('0.01')

  useEffect(() => {
    async function init() {
      if (typeof window.ethereum !== 'undefined') {
        const prov = new ethers.BrowserProvider(window.ethereum)
        const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        if (accounts.length > 0) {
          const signer = await prov.getSigner()
          const userAddress = await signer.getAddress()
          const escrowContract = new ethers.Contract(ESCROW_CONTRACT, escrowAbi, signer)
          const token = new ethers.Contract(TCG_TOKEN_CONTRACT, tokenAbi, signer)

          setProvider(prov)
          setSigner(signer)
          setEscrow(escrowContract)
          setTokenContract(token)
          setWalletAddress(userAddress)
          setConnected(true)
        }
      }
    }

    init()
  }, [])

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
  }

  async function listNFT() {
    if (!signer || !escrow || !tokenContract) return
    const priceInWei = ethers.parseEther(animePrice)
    const approved = await tokenContract.isApprovedForAll(walletAddress, ESCROW_CONTRACT)
    if (!approved) {
      const tx = await tokenContract.setApprovalForAll(ESCROW_CONTRACT, true)
      await tx.wait()
    }

    // Hardcoded token ID = 1
    const tx = await escrow.createEscrow(TCG_TOKEN_CONTRACT, 1, nftAmount, priceInWei)
    await tx.wait()
    fetchListings()
  }

  async function buy(index, priceInWei) {
    const tx = await escrow.buyWithAnime(index, { value: priceInWei })
    await tx.wait()
    fetchListings()
  }

  async function cancelEscrow(index) {
    const tx = await escrow.removeEscrow(index)
    await tx.wait()
    fetchListings()
  }

  async function fetchListings() {
    const all = []
    for (let i = 0; i < 20; i++) {
      try {
        const e = await escrow.getEscrow(i)
        if (e[3].toString() === '0') continue

        let uri = await tokenContract.uri(e[2])
        const hexId = e[2].toString(16).padStart(64, '0')
        uri = uri.replace('{id}', hexId)
        if (uri.startsWith('ipfs://')) {
          uri = uri.replace('ipfs://', 'https://ipfs.io/ipfs/')
        }

        let image = ''
        try {
          const res = await fetch(uri)
          const json = await res.json()
          image = json.image?.replace('ipfs://', 'https://ipfs.io/ipfs/')
        } catch {}

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

  useEffect(() => {
    if (escrow) fetchListings()
  }, [escrow])

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>TCG Marketplace</h1>
        {!connected ? (
          <button onClick={connectWallet} style={{ backgroundColor: '#111', color: 'white', padding: '0.4rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>
            Connect Wallet
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
            <button onClick={disconnectWallet} style={{ backgroundColor: '#eee', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
              Disconnect
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ fontWeight: 'bold' }}>List Your TCG Item</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label>Amount
            <input type="number" value={nftAmount} onChange={e => setNftAmount(e.target.value)} />
          </label>
          <label>TOTAL listing price in ANIME
  <input
    type="text"
    placeholder="Total amount for the full bundle"
    value={animePrice}
    onChange={e => setAnimePrice(e.target.value)}
  />
</label>
          <button onClick={listNFT} style={{ padding: '0.5rem', backgroundColor: '#111', color: 'white', borderRadius: '6px', cursor: 'pointer' }}>
            List TCG
          </button>
        </div>
      </div>

      <div style={{ marginTop: '3rem' }}>
        <h2 style={{ fontWeight: 'bold' }}>Live Listings</h2>
        <button onClick={fetchListings} style={{ marginBottom: '1rem' }}>🔄 Refresh</button>
        {listings.length === 0 && <p>No listings found.</p>}
        {listings.map(listing => (
          <div key={listing.index} style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1rem' }}>
            {listing.image && <img src={listing.image} alt={`TCG ${listing.tokenID}`} style={{ width: '100%', maxHeight: '250px', objectFit: 'cover', marginBottom: '0.5rem' }} />}
            <p><strong>ID:</strong> {listing.tokenID}</p>
            <p><strong>Amount:</strong> {listing.amount}</p>
            <p><strong>Price:</strong> {listing.price} ANIME</p>
            <button onClick={() => buy(listing.index, listing.rawPrice)} style={{ padding: '0.5rem 1rem', backgroundColor: '#198754', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              Buy
            </button>
            {listing.seller.toLowerCase() === walletAddress.toLowerCase() && (
              <button onClick={() => cancelEscrow(listing.index)} style={{ marginLeft: '0.5rem', padding: '0.5rem 1rem', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                Cancel
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default App

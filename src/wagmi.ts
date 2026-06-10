import { createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';

// EIP-6963 injected-wallet discovery is on by default in wagmi v3 — no connectors array.
export const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
});

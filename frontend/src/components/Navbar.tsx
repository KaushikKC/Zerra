import { Link, useLocation } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

export default function Navbar() {
  const location = useLocation();
  const { isConnected } = useAccount();

  return (
    <header className="sticky top-0 z-50 bg-white/30 backdrop-blur-xl border-b border-black/5">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 sm:px-12">
        <div className="flex items-center gap-12">
          <Link
            to="/"
            className="flex items-center gap-3 group transition-transform hover:scale-105"
          >
            <div className="w-10 h-10 bg-[#132318] rounded-xl flex items-center justify-center transition-all duration-500 group-hover:bg-[#E1FF76] group-hover:rotate-12 shadow-lg">
              <span className="text-[#E1FF76] font-black text-2xl group-hover:text-[#132318] transition-colors">
                Z
              </span>
            </div>
            <span className="text-2xl font-black tracking-tighter text-[#132318]">
              Zerra
            </span>
          </Link>
          <nav className="hidden sm:flex items-center gap-2">
            {isConnected && (
              <Link
                to="/merchant"
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${location.pathname === "/merchant"
                  ? "bg-fin-dark text-white"
                  : "text-black/60 hover:text-black hover:bg-black/5"
                  }`}
              >
                Dashboard
              </Link>
            )}
            <Link
              to="/pitch"
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${location.pathname === "/pitch"
                ? "bg-fin-dark text-white"
                : "text-black/60 hover:text-black hover:bg-black/5"
                }`}
            >
              Pitch
            </Link>
          </nav>
        </div>

        <ConnectButton
          chainStatus="icon"
          showBalance={false}
          accountStatus="avatar"
        />
      </div>
    </header>
  );
}

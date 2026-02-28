import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Globe,
  Zap,
  Shield,
  Wallet,
  ShoppingBag,
  Layout,
  Code,
  Server,
  CheckCircle2,
  Share2,
  Layers,
  Repeat,
  Cpu,
  Smartphone,
} from "lucide-react";

// Slide Components
const Slide1 = () => (
  <section className="relative h-full flex items-center justify-center px-8 md:px-16 overflow-hidden">
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[#E1FF76]/5 rounded-full blur-[120px] -z-10" />
    <div className="max-w-7xl mx-auto text-center">
      <div className="inline-flex items-center gap-3 pill-tag mb-12 shadow-lg animate-float">
        <span className="w-2 h-2 rounded-full bg-fin-dark"></span>
        <span className="font-black uppercase tracking-[0.2em] text-[10px]">
          Merchant Payment Layer for Arc
        </span>
      </div>
      <h1 className="text-[10vw] font-black leading-none tracking-tighter text-fin-dark mb-12">
        ZERRA
      </h1>
      <p className="text-3xl md:text-5xl font-medium tracking-tight text-fin-dark/60 max-w-4xl mx-auto leading-tight">
        Any chain in.{" "}
        <span className="text-fin-dark italic underline decoration-fin-lime decoration-[12px] underline-offset-[8px]">
          USDC on Arc
        </span>{" "}
        out. <br className="hidden md:block" /> One click.
      </p>
      <div className="mt-20 flex justify-center gap-6">
        <div className="w-20 h-1 bg-fin-dark/10 rounded-full"></div>
        <div className="w-20 h-1 bg-fin-lime rounded-full shadow-[0_0_10px_#E1FF76]"></div>
        <div className="w-20 h-1 bg-fin-dark/10 rounded-full"></div>
      </div>
    </div>
  </section>
);

const Slide2 = () => (
  <section className="h-full flex items-center bg-fin-dark text-white relative overflow-hidden px-8 md:px-16">
    <div className="absolute top-0 right-0 w-1/3 h-full bg-fin-lime/5 blur-[120px]" />
    <div className="max-w-7xl mx-auto w-full">
      <div className="grid lg:grid-cols-2 gap-20 items-center">
        <div>
          <span className="text-fin-lime font-black uppercase tracking-[0.3em] text-xs mb-8 block">
            Problem
          </span>
          <h2 className="text-5xl md:text-7xl font-black tracking-tighter mb-12 leading-[0.9]">
            Web3 Payments <br />
            <span className="text-fin-lime/80 italic">Are Broken</span>
          </h2>
          <p className="text-2xl text-white/70 font-medium leading-relaxed mb-12">
            The average user holds funds scattered across 3+ chains. To pay a
            merchant on Arc:
          </p>
          <div className="space-y-4">
            {[
              "Find a bridge manually",
              "Wait 15–30 minutes for it to complete",
              "Buy ETH on the destination chain just for gas",
              "Come back and finally make the payment",
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-6 group">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-black text-fin-lime">
                  {i + 1}
                </div>
                <span className="text-xl font-bold text-white/90">{step}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative">
          <div className="fin-card !bg-white/5 !border-white/10 !p-12 text-center">
            <div className="text-[10rem] font-black text-fin-lime leading-none mb-4">
              5-10
            </div>
            <div className="text-xl font-black uppercase tracking-widest text-white mb-8">
              Manual Steps
            </div>
            <div className="h-px bg-white/10 w-full mb-8"></div>
            <div className="text-[8rem] font-black text-white/20 leading-none">
              15-30
            </div>
            <div className="text-lg font-black uppercase tracking-widest text-white/40">
              Minutes Lost
            </div>
          </div>
        </div>
      </div>
      <div className="mt-16 p-6 bg-red-500/10 border border-red-500/20 rounded-3xl text-center">
        <p className="text-2xl font-black text-red-400">
          Result: Web3 commerce doesn't happen.
        </p>
      </div>
    </div>
  </section>
);

const Slide3 = () => (
  <section className="h-full flex items-center bg-fin-bg relative px-8 md:px-16">
    <div className="max-w-7xl mx-auto text-center w-full">
      <span className="text-fin-dark font-black uppercase tracking-[0.3em] text-xs mb-8 block">
        Solution
      </span>
      <h2 className="text-6xl md:text-[7rem] font-black tracking-tighter text-fin-dark mb-12 leading-[0.85]">
        One Button. <br />{" "}
        <span className="text-fin-dark/40 italic">Any Chain.</span> Done.
      </h2>
      <div className="grid md:grid-cols-3 gap-8 text-left">
        <div className="fin-card">
          <div className="w-16 h-16 bg-fin-lime rounded-2xl flex items-center justify-center mb-8 shadow-lg">
            <Globe className="w-8 h-8 text-fin-dark" />
          </div>
          <h3 className="text-2xl font-black mb-4">Abstraction</h3>
          <p className="text-fin-dark/70 font-medium">
            Scanning, swapping, and bridging — all handled automatically.
          </p>
        </div>
        <div className="fin-card">
          <div className="w-16 h-16 bg-fin-dark rounded-2xl flex items-center justify-center mb-8 shadow-lg">
            <Zap className="w-8 h-8 text-fin-lime" />
          </div>
          <h3 className="text-2xl font-black mb-4">Speed</h3>
          <p className="text-fin-dark/70 font-medium">
            From any chain to settled USDC on Arc in under 10 seconds.
          </p>
        </div>
        <div className="fin-card">
          <div className="w-16 h-16 bg-[#DFECEF] rounded-2xl flex items-center justify-center mb-8 shadow-lg">
            <Shield className="w-8 h-8 text-fin-dark" />
          </div>
          <h3 className="text-2xl font-black mb-4">Simplicity</h3>
          <p className="text-fin-dark/70 font-medium">
            No external pages. No gas struggle. One signature.
          </p>
        </div>
      </div>
    </div>
  </section>
);

const Slide4 = () => (
  <section className="h-full flex items-center bg-fin-dark text-white overflow-hidden relative px-8 md:px-16">
    <div className="max-w-7xl mx-auto w-full">
      <div className="text-center mb-24">
        <h2 className="text-5xl md:text-7xl font-black mb-8 tracking-tighter">
          5 Steps. <span className="text-fin-lime">All Invisible.</span>
        </h2>
        <div className="pill-tag !bg-white/5 !text-white/80 !border-white/10 mx-auto inline-flex">
          Single Signature Sourcing
        </div>
      </div>
      <div className="grid md:grid-cols-5 gap-4 relative">
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white/10 -translate-y-1/2 hidden md:block -z-0" />
        {[
          {
            title: "Scan",
            desc: "Read balances instantly",
            icon: <Smartphone className="w-6 h-6" />,
          },
          {
            title: "Route",
            desc: "Optimal sourcing plan",
            icon: <Layers className="w-6 h-6" />,
          },
          {
            title: "Bridge",
            desc: "Gateway < 500ms",
            icon: <Zap className="w-6 h-6" />,
          },
          {
            title: "Settle",
            desc: "Minted on Arc",
            icon: <CheckCircle2 className="w-6 h-6" />,
          },
          {
            title: "Pay",
            desc: "Merchant settled",
            icon: <ShoppingBag className="w-6 h-6" />,
          },
        ].map((step, i) => (
          <div key={i} className="relative z-10">
            <div className="fin-card !bg-fin-dark !border-white/10 !p-8 h-full group hover:!border-fin-lime">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-fin-lime mb-6">
                {step.icon}
              </div>
              <h3 className="text-lg font-black mb-2">{step.title}</h3>
              <p className="text-xs font-bold text-white/50">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Slide5 = () => (
  <section className="h-full flex items-center bg-fin-bg relative px-8 md:px-16">
    <div className="max-w-7xl mx-auto w-full">
      <h2 className="text-6xl md:text-7xl font-black text-center mb-24 tracking-tighter">
        A Complete{" "}
        <span className="text-fin-dark/40 italic">Commerce Product</span>
      </h2>
      <div className="grid lg:grid-cols-2 gap-12">
        <div className="space-y-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-fin-dark text-fin-lime rounded-2xl flex items-center justify-center">
              <Layout className="w-6 h-6" />
            </div>
            <h3 className="text-3xl font-black">Merchant</h3>
          </div>
          <div className="grid gap-3">
            {[
              "Arc wallet display name",
              "Payment links & QR codes",
              "Product Storefront",
              "Full dashboard & webhooks",
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 rounded-xl bg-white border border-fin-dark/5"
              >
                <CheckCircle2 className="w-5 h-5 text-fin-lime" />
                <span className="font-bold text-fin-dark/80">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-fin-lime text-fin-dark rounded-2xl flex items-center justify-center">
              <Wallet className="w-6 h-6" />
            </div>
            <h3 className="text-3xl font-black">Payer</h3>
          </div>
          <div className="grid gap-3">
            {[
              "Pre-filled details",
              "Auto balance scan",
              "One MetaMask popup",
              "Live progress tracker",
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 rounded-xl bg-white border border-fin-dark/5"
              >
                <CheckCircle2 className="w-5 h-5 text-fin-dark/20" />
                <span className="font-bold text-fin-dark/80">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
);

const Slide6 = () => (
  <section className="h-full flex items-center bg-fin-teal relative overflow-hidden px-8 md:px-16">
    <div className="max-w-7xl mx-auto w-full">
      <div className="text-center mb-16">
        <h2 className="text-5xl md:text-7xl font-black mb-4 tracking-tighter">
          Zerra vs Trails
        </h2>
        <p className="text-xl font-black text-fin-dark/60 uppercase tracking-widest">
          Actual Product vs Infrastructure
        </p>
      </div>
      <div className="overflow-hidden rounded-3xl border border-fin-dark/10 bg-white/50 backdrop-blur-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-fin-dark text-white">
              <th className="py-6 px-8 text-xl font-black">Feature</th>
              <th className="py-6 px-8 text-xl font-black text-white/40">
                Trails
              </th>
              <th className="py-6 px-8 text-xl font-black text-fin-lime">
                Zerra
              </th>
            </tr>
          </thead>
          <tbody className="text-lg font-bold">
            {[
              { f: "Type", t: "SDK", z: "Consumer Product" },
              { f: "Bridge", t: "CCTP (~30s)", z: "Gateway (<0.5s)" },
              { f: "Merchants", t: "None", z: "Storefront/QR" },
              { f: "Gas", t: "Manual", z: "Arc-native USDC" },
              { f: "Splits", t: "No", z: "Yes — On-chain" },
            ].map((row, i) => (
              <tr key={i} className="border-b border-fin-dark/5">
                <td className="py-6 px-8">{row.f}</td>
                <td className="py-6 px-8 text-fin-dark/30">{row.t}</td>
                <td className="py-6 px-8 bg-fin-lime/5 font-black">{row.z}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </section>
);

const Slide7 = () => (
  <section className="h-full flex items-center bg-fin-dark text-white px-8 md:px-16">
    <div className="max-w-7xl mx-auto w-full">
      <h2 className="text-6xl md:text-7xl font-black mb-20 tracking-tighter text-center">
        Built Right, <span className="text-fin-lime/80 italic">Not Fast</span>
      </h2>
      <div className="grid md:grid-cols-2 gap-8">
        {[
          {
            title: "Circle Gateway",
            desc: "Sub-500ms settlement. One unified USDC balance.",
            icon: <Zap className="text-fin-dark" />,
            bg: "bg-fin-lime",
          },
          {
            title: "Session Keys",
            desc: "User authorizes once. Backend executes silently.",
            icon: <Shield className="text-fin-lime" />,
            bg: "bg-white/10",
          },
          {
            title: "USDC Gas",
            desc: "Destination minting costs zero legacy gas tokens.",
            icon: <Globe className="text-blue-400" />,
            bg: "bg-blue-500/10",
          },
          {
            title: "Smart Splits",
            desc: "Revenue sharing handled natively on-chain.",
            icon: <Layers className="text-orange-400" />,
            bg: "bg-orange-500/10",
          },
        ].map((item, i) => (
          <div key={i} className="fin-card !bg-white/5 !border-white/10 !p-10">
            <div
              className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center mb-6`}
            >
              {item.icon}
            </div>
            <h3 className="text-2xl font-black mb-4">{item.title}</h3>
            <p className="text-white/60 font-medium leading-relaxed">
              {item.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Slide8 = () => (
  <section className="h-full flex items-center bg-fin-bg px-8 md:px-16">
    <div className="max-w-7xl mx-auto w-full">
      <div className="grid lg:grid-cols-2 gap-20 items-center">
        <div>
          <span className="pill-tag mb-8">Smart Contract</span>
          <h2 className="text-5xl font-black mb-8 tracking-tighter">
            PaymentRouter.sol
          </h2>
          <p className="text-xl text-fin-dark/60 font-medium mb-10">
            Single `pay()` call handles settlement, fees, and splits with USDC
            as gas.
          </p>
          <div className="space-y-4">
            {[
              "Platform fee deduction",
              "Merchant settlement",
              "On-chain event logging",
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-4 text-lg font-bold"
              >
                <div className="w-5 h-5 rounded-full bg-fin-lime flex items-center justify-center">
                  <CheckCircle2 className="w-3 h-3 text-fin-dark" />
                </div>
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-fin-dark rounded-[2rem] p-8 shadow-2xl overflow-hidden font-mono text-xs md:text-sm">
          <pre className="text-fin-lime leading-relaxed">
            {`function pay(
  address merchant,
  uint256 amount,
  string memory refId
) external {
  // 1. Fee deduction
  uint256 fee = amount * 10 / 1000;
  usdc.transfer(treasury, fee);

  // 2. Settlement
  usdc.transfer(merchant, amount - fee);

  emit Paid(merchant, amount, refId);
}`}
          </pre>
        </div>
      </div>
    </div>
  </section>
);

const Slide9 = () => (
  <section className="h-full flex items-center bg-fin-dark text-white px-8 md:px-16">
    <div className="max-w-7xl mx-auto w-full text-center">
      <h2 className="text-5xl md:text-7xl font-black mb-20 tracking-tighter">
        The <span className="text-fin-lime italic">Stack</span>
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {[
          { l: "Bridge", v: "Gateway", i: <Zap /> },
          { l: "Asset", v: "USDC", i: <Repeat /> },
          { l: "Chain", v: "Arc", i: <Globe /> },
          { l: "Gas", v: "USDC", i: <Cpu /> },
          { l: "AA", v: "4337", i: <Smartphone /> },
          { l: "Swap", v: "1inch", i: <Layers /> },
          { l: "Logic", v: "Solidity", i: <Code /> },
          { l: "UI", v: "React", i: <Layout /> },
          { l: "API", v: "Node", i: <Server /> },
          { l: "Dev", v: "Vite", i: <Code /> },
        ].map((item, i) => (
          <div key={i} className="fin-card !bg-white/5 !border-white/10 !p-8">
            <div className="text-fin-lime mb-4 flex justify-center">
              {item.i}
            </div>
            <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">
              {item.l}
            </div>
            <div className="text-lg font-black">{item.v}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Slide10 = () => (
  <section className="h-full flex items-center bg-fin-bg px-8 md:px-16">
    <div className="max-w-7xl mx-auto w-full">
      <h2 className="text-6xl font-black text-center mb-16 tracking-tighter">
        Architecture
      </h2>
      <div className="relative p-12 bg-white border border-fin-dark/10 rounded-[3rem] shadow-xl overflow-hidden">
        <div className="grid lg:grid-cols-3 gap-8 items-center text-center relative z-10">
          <div className="p-8 bg-fin-dark rounded-3xl text-white">
            <div className="text-[10px] font-black uppercase mb-4 opacity-50">
              In
            </div>
            <div className="text-lg font-black">Any Chain (ETH/Base)</div>
          </div>
          <div className="p-10 bg-fin-lime rounded-[2.5rem] text-fin-dark shadow-xl">
            <div className="text-xs font-black uppercase mb-2">Process</div>
            <div className="text-xl font-black">Zerra Core</div>
            <div className="text-[10px] font-bold">Circle Gateway</div>
          </div>
          <div className="p-8 bg-fin-teal rounded-3xl text-fin-dark">
            <div className="text-[10px] font-black uppercase mb-4 opacity-50">
              Out
            </div>
            <div className="text-lg font-black">USDC on Arc</div>
          </div>
        </div>
        <div className="absolute top-0 left-0 w-full h-full bg-dot-grid opacity-10" />
      </div>
    </div>
  </section>
);

const Slide11 = () => (
  <section className="h-full flex items-center bg-fin-dark text-white px-8 md:px-16">
    <div className="max-w-7xl mx-auto w-full">
      <h2 className="text-6xl text-center mb-20 font-black tracking-tighter">
        Use Cases
      </h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            t: "Freelancing",
            d: "Invoices paid from any chain, settled on Arc.",
            i: <Code />,
          },
          {
            t: "Commerce",
            d: "One-click pay buttons for every dApp.",
            i: <ShoppingBag />,
          },
          {
            t: "Subscriptions",
            d: "One-time auth for recurring monthly USDC.",
            i: <Repeat />,
          },
          {
            t: "Revenue",
            d: "Native on-chain splits for co-founders.",
            i: <Share2 />,
          },
        ].map((item, i) => (
          <div key={i} className="fin-card !bg-white/5 !border-white/10 !p-8">
            <div className="w-12 h-12 bg-fin-lime text-fin-dark rounded-xl flex items-center justify-center mb-6">
              {item.i}
            </div>
            <h3 className="text-xl font-black mb-4">{item.t}</h3>
            <p className="text-white/50 text-sm leading-relaxed">{item.d}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Slide12 = () => (
  <section className="h-full flex items-center bg-fin-bg px-8 md:px-16">
    <div className="max-w-7xl mx-auto w-full">
      <div className="fin-card !p-12 relative overflow-hidden bg-white/50 backdrop-blur-sm">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-5xl font-black mb-6 tracking-tighter">
              Mainnet Ready
            </h2>
            <p className="text-xl text-fin-dark/70 font-medium mb-10 leading-relaxed">
              Single .env switch transforms the stack from UniV2/Sepolia to
              1inch/Ethereum. Zero re-architecture.
            </p>
            <ul className="space-y-4 font-bold text-fin-dark/60">
              <li>• Switch Swap Providers via interface</li>
              <li>• Point Gateway to Mainnet API</li>
              <li>• Deploy PaymentRouter to Arc Mainnet</li>
            </ul>
          </div>
          <div className="bg-fin-dark rounded-2xl p-8 text-white font-mono text-lg shadow-xl">
            <div className="text-fin-lime opacity-50 text-sm mb-4">
              # Switch in 1 second
            </div>
            <div>
              <span className="text-white/30">NETWORK=</span>mainnet
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const Slide13 = () => (
  <section className="h-full flex items-center bg-fin-dark text-white text-center relative overflow-hidden px-8 md:px-16">
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-fin-lime/5 rounded-full blur-[120px]" />
    <div className="relative z-10 max-w-5xl mx-auto">
      <div className="w-20 h-20 bg-fin-lime rounded-2xl flex items-center justify-center mx-auto mb-12 shadow-2xl">
        <span className="text-fin-dark font-black text-5xl">Z</span>
      </div>
      <h2 className="text-[8rem] font-black leading-none tracking-tighter mb-8">
        ZERRA
      </h2>
      <p className="text-3xl md:text-4xl font-medium tracking-tight text-fin-lime mb-20">
        Any chain in. USDC on Arc out.
      </p>
      <Link
        to="/"
        className="btn-primary !bg-fin-lime !text-fin-dark mx-auto inline-flex text-xl px-12 py-5"
      >
        Go to Website <ArrowRight className="w-6 h-6" />
      </Link>
      <div className="mt-24 text-[10px] font-black uppercase tracking-[0.4em] opacity-30">
        Built for Encode × Arc Hackathon
      </div>
    </div>
  </section>
);

const SLIDES = [
  Slide1,
  Slide2,
  Slide3,
  Slide4,
  Slide5,
  Slide6,
  Slide7,
  Slide8,
  Slide9,
  Slide10,
  Slide11,
  Slide12,
  Slide13,
];

export default function PitchDeck() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev < SLIDES.length - 1 ? prev + 1 : prev));
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        nextSlide();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        prevSlide();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide]);

  return (
    <div className="h-screen w-full bg-fin-bg overflow-hidden relative selection:bg-fin-lime selection:text-fin-dark">
      {/* Header / Logo */}
      <div className="fixed top-8 left-8 z-50 flex items-center gap-3">
        <Link
          to="/"
          className="w-8 h-8 bg-fin-dark rounded-lg flex items-center justify-center shadow-lg hover:rotate-12 transition-all"
        >
          <span className="text-fin-lime font-black text-lg">Z</span>
        </Link>
        <span className="text-xs font-black uppercase tracking-widest text-fin-dark/40">
          Zerra Pitch
        </span>
      </div>

      {/* Slide Container */}
      <div
        className="h-full w-full transition-all duration-700 ease-in-out"
        style={{ transform: `translateY(-${currentSlide * 100}%)` }}
      >
        {SLIDES.map((Slide, idx) => (
          <div key={idx} className="h-screen w-full flex-shrink-0">
            <Slide />
          </div>
        ))}
      </div>

      {/* Navigation Controls */}
      <div className="fixed bottom-8 right-8 z-50 flex items-center gap-4">
        <div className="bg-white/80 backdrop-blur-md border border-fin-dark/5 p-2 rounded-2xl flex gap-2 shadow-xl">
          <button
            onClick={prevSlide}
            disabled={currentSlide === 0}
            className="p-3 rounded-xl bg-fin-dark/5 text-fin-dark hover:bg-fin-dark hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center px-4 font-black text-fin-dark/40 text-sm tracking-widest">
            {(currentSlide + 1).toString().padStart(2, "0")} /{" "}
            {SLIDES.length.toString().padStart(2, "0")}
          </div>
          <button
            onClick={nextSlide}
            disabled={currentSlide === SLIDES.length - 1}
            className="p-3 rounded-xl bg-fin-dark text-white hover:bg-black hover:scale-105 active:scale-95 disabled:opacity-20 disabled:pointer-events-none transition-all shadow-lg"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Simple Progress Bar */}
      <div
        className="fixed bottom-0 left-0 h-1 bg-fin-lime shadow-[0_0_10px_#E1FF76] transition-all duration-500 z-50"
        style={{ width: `${((currentSlide + 1) / SLIDES.length) * 100}%` }}
      />

      {/* Slide Indicators on the side */}
      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50 hidden md:flex flex-col gap-3">
        {SLIDES.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentSlide(idx)}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
              currentSlide === idx
                ? "h-8 bg-fin-dark shadow-[0_0_10px_rgba(0,0,0,0.1)]"
                : "bg-fin-dark/10 hover:bg-fin-dark/30"
            }`}
          />
        ))}
      </div>

      {/* Keyboard hint */}
      <div className="fixed bottom-8 left-8 z-50 animate-pulse hidden md:block">
        <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[2px] text-fin-dark/20">
          <div className="p-1 border border-fin-dark/10 rounded">Arrows</div>
          <span>To Navigate</span>
        </div>
      </div>
    </div>
  );
}

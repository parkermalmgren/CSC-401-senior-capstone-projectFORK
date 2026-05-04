// app/page.tsx
import Link from "next/link";
import Image from "next/image";
import LandingPageFooter from "@/components/LandingPageFooter";
import AuthRecoveryHashRedirect from "@/components/AuthRecoveryHashRedirect";

export default function Home() {
  return (
    <>
      <AuthRecoveryHashRedirect />
      <MarketingHome />
    </>
  );
}

function MarketingHome() {
  return (
    <main className="min-h-screen -mt-16 bg-brand-bg">
      {/* HERO BANNER */}
      <section 
        className="relative min-h-[60vh] flex flex-col text-white bg-cover bg-center"
        style={{
          backgroundImage: "url('/Landing_hero_img.png')",
        }}
      >
        {/* Contrast overlay */}
        <div className="absolute inset-0 bg-black/45" />
        
        {/* Top Bar with Buttons and Logo */}
        <div className="relative z-10 flex items-center justify-between px-6 py-4">
          {/* Login/Signup Buttons - Top Left */}
          <div className="flex gap-3">
            <Link
              href="/login"
              className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition text-sm"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="px-5 py-2 rounded-lg bg-brand-card text-green-500 font-medium hover:bg-green-900/20 transition text-sm border border-green-600"
            >
              Sign Up
            </Link>
          </div>
          
          {/* Logo - Top Right */}
          <div>
            <Image 
              src="/Green_Basket_Icon.png" 
              alt="SmartPantry Logo" 
              width={48} 
              height={48}
              className="drop-shadow-lg"
            />
          </div>
        </div>
        
        {/* Hero Content - Centered */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4">
          <h1 
            className="text-5xl md:text-7xl font-extrabold mb-4 drop-shadow-[0_6px_16px_rgba(0,0,0,0.45)] text-white"
            style={{ fontFamily: "'Montserrat', sans-serif" }}
          >
            Smart Pantry
          </h1>
          <p 
            className="text-lg md:text-xl opacity-95 text-white"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            Welcome to food and waste management re-invented.
          </p>
        </div>
      </section>

      {/* ABOUT */}
      <section className="max-w-5xl mx-auto px-4 pt-16 pb-12">
        <h2 className="text-3xl font-semibold text-center text-brand-text mb-6">
          About Us
        </h2>
        <div 
          className="mx-auto max-w-3xl shadow-lg rounded-2xl p-8 text-gray-300 text-center bg-brand-card border border-green-900/30"
        >
          Smart Pantry is designed to make everyday food management simpler, smarter, and more sustainable. Our mission is to help households reduce food waste, save money, and enjoy fresher meals by combining technology with practical kitchen habits. With barcode scanning, AI-driven freshness predictions, and recipe recommendations, Smart Pantry keeps you connected to what&apos;s in your kitchen without the guesswork.
        </div>
      </section>

      {/* WHAT WE OFFER BANNER */}
      <section 
        className="relative min-h-[25vh] flex items-center justify-center text-white bg-cover bg-center"
        style={{
          backgroundImage: "url('/What_we_offer.png')",
        }}
      >
        {/* Contrast overlay */}
        <div className="absolute inset-0 bg-black/45" />
        
        {/* Banner Content */}
        <h2 
          className="relative z-10 text-4xl md:text-5xl font-extrabold drop-shadow-[0_6px_16px_rgba(0,0,0,0.45)]"
          style={{ fontFamily: "'Montserrat', sans-serif" }}
        >
          What We Offer
        </h2>
      </section>

      {/* WHAT WE OFFER CONTENT */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Smart Scanning */}
          <div className="flex flex-col items-center">
            <div className="bg-brand-card rounded-2xl p-6 shadow-lg w-full h-full flex flex-col border border-gray-800">
              <h3 className="font-semibold mb-3 text-xl text-brand-text">✨ Smart Scanning</h3>
              <p className="text-gray-400 text-base flex-grow">
                Quickly add groceries to your pantry with AI-powered barcode scanning and receipt OCR. Just snap a photo or scan an item, and Smart Pantry automatically identifies the product, category, and quantity, saving you time and avoiding manual entry.
              </p>
            </div>
            <Image 
              src="/Smart_scanning.png" 
              alt="Smart Scanning" 
              width={200} 
              height={200}
              className="mt-6"
            />
          </div>

          {/* Freshness Alerts */}
          <div className="flex flex-col items-center">
            <div className="bg-brand-card rounded-2xl p-6 shadow-lg w-full h-full flex flex-col border border-gray-800">
              <h3 className="font-semibold mb-3 text-xl text-brand-text">🥬 Freshness Alerts</h3>
              <p className="text-gray-400 text-base flex-grow">
                Stay one step ahead of food waste with timely reminders before items expire. Our freshness tracker predicts shelf life based on item type and purchase date, then alerts you so you can use ingredients while they&apos;re still at their best.
              </p>
            </div>
            <Image 
              src="/Freshness_alerts.png" 
              alt="Freshness Alerts" 
              width={200} 
              height={200}
              className="mt-6"
            />
          </div>

          {/* Recipe Magic */}
          <div className="flex flex-col items-center">
            <div className="bg-brand-card rounded-2xl p-6 shadow-lg w-full h-full flex flex-col border border-gray-800">
              <h3 className="font-semibold mb-3 text-xl text-brand-text">🧑‍🍳 Recipe Magic</h3>
              <p className="text-gray-400 text-base flex-grow">
                Turn what&apos;s in your kitchen into delicious meals with personalized recipe suggestions. Filter by dietary needs or preferences, and discover creative ways to combine ingredients you already have, reducing waste and making cooking easier.
              </p>
            </div>
            <Image 
              src="/Recipe_Magic.png" 
              alt="Recipe Magic" 
              width={200} 
              height={200}
              className="mt-6"
            />
          </div>
        </div>
      </section>

      {/* LANDING PAGE FOOTER */}
      <LandingPageFooter />
    </main>
  );
}
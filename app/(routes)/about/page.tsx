import Image from "next/image";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* About Us Section */}
        <section className="mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-center text-slate-800 mb-8">
            About Us
          </h1>
          <div 
            className="mx-auto max-w-3xl shadow-lg rounded-2xl p-8 text-slate-700 text-center"
            style={{ backgroundColor: 'rgba(39, 174, 96, 0.1)' }}
          >
            Smart Pantry is designed to make everyday food management simpler, smarter, and more sustainable. Our mission is to help households reduce food waste, save money, and enjoy fresher meals by combining technology with practical kitchen habits. With barcode scanning, AI-driven freshness predictions, and recipe recommendations, Smart Pantry keeps you connected to what&apos;s in your kitchen without the guesswork.
          </div>
        </section>

        {/* What We Offer Section */}
        <section>
          <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-800 mb-12">
            What We Offer
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {/* Smart Scanning */}
            <div className="flex flex-col items-center">
              <div className="bg-white rounded-2xl p-6 shadow-lg w-full h-full flex flex-col mb-6">
                <h3 className="font-semibold mb-3 text-xl">✨ Smart Scanning</h3>
                <p className="text-slate-600 text-base flex-grow">
                  Quickly add groceries to your pantry with AI-powered barcode scanning and receipt OCR. Just snap a photo or scan an item, and Smart Pantry automatically identifies the product, category, and quantity, saving you time and avoiding manual entry.
                </p>
              </div>
              <Image 
                src="/Smart_scanning.png" 
                alt="Smart Scanning" 
                width={200} 
                height={200}
              />
            </div>

            {/* Freshness Alerts */}
            <div className="flex flex-col items-center">
              <div className="bg-white rounded-2xl p-6 shadow-lg w-full h-full flex flex-col mb-6">
                <h3 className="font-semibold mb-3 text-xl">🥬 Freshness Alerts</h3>
                <p className="text-slate-600 text-base flex-grow">
                  Stay one step ahead of food waste with timely reminders before items expire. Our freshness tracker predicts shelf life based on item type and purchase date, then alerts you so you can use ingredients while they&apos;re still at their best.
                </p>
              </div>
              <Image 
                src="/Freshness_alerts.png" 
                alt="Freshness Alerts" 
                width={200} 
                height={200}
              />
            </div>

            {/* Recipe Magic */}
            <div className="flex flex-col items-center">
              <div className="bg-white rounded-2xl p-6 shadow-lg w-full h-full flex flex-col mb-6">
                <h3 className="font-semibold mb-3 text-xl">🧑🍳 Recipe Magic</h3>
                <p className="text-slate-600 text-base flex-grow">
                  Turn what&apos;s in your kitchen into delicious meals with personalized recipe suggestions. Filter by dietary needs or preferences, and discover creative ways to combine ingredients you already have, reducing waste and making cooking easier.
                </p>
              </div>
              <Image 
                src="/Recipe_Magic.png" 
                alt="Recipe Magic" 
                width={200} 
                height={200}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

// components/Dashboard.tsx
"use client";

export default function Dashboard() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center py-8 overflow-x-hidden">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 pb-8">
        {/* Header */}
        <header className="text-center mb-6 md:mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-800 mb-2">
            Welcome to Smart Pantry
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-slate-600 px-2">
            Manage your pantry, track expirations, and find recipes to reduce food waste.
          </p>
        </header>

        {/* Quick Actions */}
        <div className="max-w-4xl mx-auto mb-8 md:mb-10">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <a 
              href="/pantry"
              className="bg-white rounded-2xl shadow-lg p-5 hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer group"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                  <span className="text-3xl">📱</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Scan Item</h3>
                <p className="text-sm text-slate-600">Quickly add items with barcode scanner</p>
              </div>
            </a>

            <a 
              href="/shopping"
              className="bg-white rounded-2xl shadow-lg p-5 hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer group"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                  <span className="text-3xl">🛒</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Shopping List</h3>
                <p className="text-sm text-slate-600">View and manage your shopping list</p>
              </div>
            </a>

            <a 
              href="/recipes"
              className="bg-white rounded-2xl shadow-lg p-5 hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer group"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                  <span className="text-3xl">📖</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Find Recipes</h3>
                <p className="text-sm text-slate-600">Discover recipes with your ingredients</p>
              </div>
            </a>
          </div>
        </div>

        {/* Tips Section */}
        <div className="max-w-6xl mx-auto">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-center text-slate-800 mb-4 md:mb-6">
            Smart Pantry Tips
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pb-4">
            {/* Tip 1 */}
            <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-5 hover:shadow-xl transition-shadow">
              <div className="w-10 h-10 mb-3 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-1.5">First In, First Out</h3>
              <p className="text-xs sm:text-sm text-slate-600">
                Place newer items behind older ones in your pantry. This ensures you use items before they expire, reducing waste.
              </p>
            </div>

            {/* Tip 2 */}
            <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-5 hover:shadow-xl transition-shadow">
              <div className="w-10 h-10 mb-3 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-1.5">Check Expiration Dates</h3>
              <p className="text-xs sm:text-sm text-slate-600">
                Regularly check expiration dates and use items that are expiring soon. Our tracker helps you stay on top of this!
              </p>
            </div>

            {/* Tip 3 */}
            <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-5 hover:shadow-xl transition-shadow">
              <div className="w-10 h-10 mb-3 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-1.5">Plan Your Meals</h3>
              <p className="text-xs sm:text-sm text-slate-600">
                Plan meals around items you already have. This helps reduce food waste and saves money on groceries.
              </p>
            </div>

            {/* Tip 4 */}
            <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-5 hover:shadow-xl transition-shadow">
              <div className="w-10 h-10 mb-3 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-1.5">Proper Storage</h3>
              <p className="text-xs sm:text-sm text-slate-600">
                Store items in the right conditions. Keep perishables refrigerated and dry goods in airtight containers.
              </p>
            </div>

            {/* Tip 5 */}
            <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-5 hover:shadow-xl transition-shadow">
              <div className="w-10 h-10 mb-3 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-1.5">Track Your Inventory</h3>
              <p className="text-xs sm:text-sm text-slate-600">
                Keep an updated inventory of what you have. Scan items as you add them to stay organized and avoid buying duplicates.
              </p>
            </div>

            {/* Tip 6 */}
            <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-5 hover:shadow-xl transition-shadow">
              <div className="w-10 h-10 mb-3 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-1.5">Use Recipe Suggestions</h3>
              <p className="text-xs sm:text-sm text-slate-600">
                Get creative with recipes based on what&apos;s in your pantry. This helps use up ingredients before they expire.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
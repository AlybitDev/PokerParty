"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [partyName, setPartyName] = useState("Poker Night");
  const [startingMoney, setStartingMoney] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [maxPlayers, setMaxPlayers] = useState(9);
  const minPlayers = 2;
  const [joinUuid, setJoinUuid] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/party", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: partyName,
          startingMoney,
          smallBlind,
          bigBlind,
          minPlayers,
          maxPlayers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/party/${data.party.uuid}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create party");
    } finally {
      setLoading(false);
    }
  }

  function handleJoin() {
    if (!joinUuid.trim()) {
      setError("Enter a party code");
      return;
    }
    router.push(`/party/${joinUuid.trim()}`);
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-green-800 rounded-2xl p-8 shadow-2xl border border-green-700 animate-scale-in">
        <h1 className="text-3xl font-bold text-center mb-6">
          <span className="inline-block animate-fade-in-down">♠</span>{" "}
          <span className="inline-block animate-fade-in-down" style={{ animationDelay: "0.1s" }}>Poker</span>{" "}
          <span className="inline-block animate-fade-in-down" style={{ animationDelay: "0.2s" }}>Party</span>{" "}
          <span className="inline-block animate-fade-in-down" style={{ animationDelay: "0.3s" }}>♥</span>
        </h1>

        <div className="flex mb-6 bg-green-900 rounded-lg p-1 animate-fade-in-up">
          <button
            onClick={() => setTab("create")}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              tab === "create" ? "bg-green-600 text-white shadow-md" : "text-green-300 hover:text-white hover:bg-green-700/50"
            }`}
          >
            Create Party
          </button>
          <button
            onClick={() => setTab("join")}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              tab === "join" ? "bg-green-600 text-white shadow-md" : "text-green-300 hover:text-white hover:bg-green-700/50"
            }`}
          >
            Join Party
          </button>
        </div>

        {error && (
          <div className="bg-red-800/80 text-red-200 px-4 py-2 rounded-lg mb-4 text-sm border border-red-700 animate-fade-in">
            {error}
          </div>
        )}

        {tab === "create" ? (
          <div key="create" className="space-y-4 animate-fade-in-up">
            <div className="animate-slide-up">
              <label className="block text-sm text-green-300 mb-1 font-medium">Party Name</label>
              <input
                type="text"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                className="w-full px-3 py-2 bg-green-900 border border-green-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition-all duration-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="animate-slide-up">
                <label className="block text-sm text-green-300 mb-1 font-medium">Starting $</label>
                <input
                  type="number"
                  value={startingMoney}
                  onChange={(e) => setStartingMoney(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-green-900 border border-green-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition-all duration-200"
                  min={100}
                />
              </div>
              <div className="animate-slide-up">
                <label className="block text-sm text-green-300 mb-1 font-medium">Small Blind</label>
                <input
                  type="number"
                  value={smallBlind}
                  onChange={(e) => setSmallBlind(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-green-900 border border-green-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition-all duration-200"
                  min={1}
                />
              </div>
              <div className="animate-slide-up" style={{ animationDelay: "0.05s" }}>
                <label className="block text-sm text-green-300 mb-1 font-medium">Big Blind</label>
                <input
                  type="number"
                  value={bigBlind}
                  onChange={(e) => setBigBlind(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-green-900 border border-green-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition-all duration-200"
                  min={2}
                />
              </div>
              <div className="animate-slide-up" style={{ animationDelay: "0.1s" }}>
                <label className="block text-sm text-green-300 mb-1 font-medium">Max Players</label>
                <input
                  type="number"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-green-900 border border-green-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition-all duration-200"
                  min={2}
                  max={9}
                />
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 active:scale-[0.98] text-green-900 font-bold rounded-lg transition-all duration-150 disabled:opacity-50 disabled:active:scale-100 shadow-lg shadow-yellow-500/20 hover:shadow-yellow-400/30"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-green-900 border-t-transparent rounded-full animate-spin-slow" />
                  Creating...
                </span>
              ) : (
                "Create Party"
              )}
            </button>
          </div>
        ) : (
          <div key="join" className="space-y-4 animate-fade-in-up">
            <div className="animate-slide-up">
              <label className="block text-sm text-green-300 mb-1 font-medium">Party Code</label>
              <input
                type="text"
                value={joinUuid}
                onChange={(e) => setJoinUuid(e.target.value)}
                className="w-full px-3 py-2 bg-green-900 border border-green-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400 transition-all duration-200"
                placeholder="Paste party code or link"
              />
            </div>
            <button
              onClick={handleJoin}
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 active:scale-[0.98] text-green-900 font-bold rounded-lg transition-all duration-150 shadow-lg shadow-yellow-500/20 hover:shadow-yellow-400/30"
            >
              Join Party
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

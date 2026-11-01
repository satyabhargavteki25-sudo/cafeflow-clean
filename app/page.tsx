"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";

import { auth } from "../lib/firebase";

export default function Home() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setLoading(true);

    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }

      router.replace("/dashboard");
    } catch (error: unknown) {
      if (error instanceof Error) {
        setMessage(error.message);
      } else {
        setMessage("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FFF7ED] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-orange-100 bg-white p-6 shadow-xl shadow-orange-100/60 sm:p-9">
        {/* CafeFlow Logo */}
        <div className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 sm:h-24 sm:w-24">
            <Image
              src="/logo.jpeg"
              alt="CafeFlow logo"
              width={256}
              height={256}
              priority
              unoptimized
              className="h-full w-full object-contain p-1.5"
            />
          </div>

          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">
            CafeFlow
          </h1>

          <p className="mt-1 text-sm font-medium text-slate-500">
            Restaurant Growth Platform
          </p>
        </div>

        {/* Login / Signup Heading */}
        <div className="mt-8">
          <h2 className="text-2xl font-extrabold text-slate-900">
            {isSignup ? "Create your account" : "Welcome back"}
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            {isSignup
              ? "Start managing your restaurant with CafeFlow."
              : "Sign in to manage your restaurant and customer feedback."}
          </p>
        </div>

        {/* Authentication Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-bold text-slate-700"
            >
              Email address
            </label>

            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-bold text-slate-700"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={6}
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
            />

            <p className="mt-2 text-xs text-slate-400">
              Password must contain at least 6 characters.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-orange-500 px-4 py-3.5 font-bold text-white shadow-md shadow-orange-200 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Please wait..."
              : isSignup
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        {/* Error Message */}
        {message && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {message}
          </div>
        )}

        {/* Login / Signup Toggle */}
        <div className="mt-6 text-center text-sm text-slate-500">
          {isSignup ? "Already have an account?" : "New to CafeFlow?"}

          <button
            type="button"
            className="ml-2 font-bold text-orange-600 hover:text-orange-700"
            onClick={() => {
              setIsSignup((previous) => !previous);
              setMessage("");
            }}
          >
            {isSignup ? "Sign in" : "Create account"}
          </button>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-slate-400">
          © 2026 CafeFlow. Built for growing restaurants.
        </p>
      </section>
    </main>
  );
}

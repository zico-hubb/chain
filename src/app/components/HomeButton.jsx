"use client";

import { useRouter } from "next/navigation";

export default function HomeButton() {
  const router = useRouter();

  const goHome = () => {
    router.push("/");
  };

  return (
    <>
      <button className="home-btn" onClick={goHome}>
        🏠 Home
      </button>

      <style jsx>{`
        .home-btn {
          background-color: #0070f3;
          color: #fff;
          border: none;
          border-radius: 6px;
          padding: 0.5rem 1rem;
          cursor: pointer;
          font-size: 0.95rem;
          font-weight: 500;
          transition: background 0.2s ease;
          margin: 0.5rem 0;
        }

        .home-btn:hover {
          background-color: #005bb5;
        }

        .home-btn:active {
          background-color: #004494;
        }
      `}</style>
    </>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import logo from "../../public/file.svg"; // put your logo in public folder

export default function HomePage() {
  return (
    <div className="container">
      <style>{`
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 2rem;
          font-family: sans-serif;
          text-align: center;
        }
        .title {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-size: 2rem;
          margin-bottom: 1.5rem;
        }
        .role-button {
          display: block;
          width: 80%;
          max-width: 300px;
          margin: 12px auto;
          padding: 12px 0;
          font-size: 1rem;
          border: none;
          border-radius: 6px;
          background: #0070f3;
          color: #fff;
          cursor: pointer;
          transition: background 0.2s;
          text-decoration: none;
          text-align: center;
        }
        .role-button:hover {
          background: #005bb5;
        }
        .warning-box {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #fff3cd;
          border: 1px solid #ffeeba;
          color: #856404;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 1.5rem;
          font-size: 0.95rem;
          text-align: left;
        }
        .warning-box span.icon {
          font-size: 1.3rem;
        }
      `}</style>

      <div className="title">
        <Image src={logo} alt="Blockchain Logo" width={40} height={40} />
        <span>HAKI Blockchain Layer</span>
      </div>

      <div className="warning-box">
        <span className="icon">⚠️</span>
        <span>
          Point to note: A MetaMask wallet connected to <b>Sepolia (Ethereum Testnet)</b> is required to interact with this layer.
        </span>
      </div>

      <Link href="/admin" className="role-button">Admin</Link>
      <Link href="/ngo_dashboard" className="role-button">NGO</Link>
      <Link href="/donor_dashboard" className="role-button">Donor</Link>
      <Link href="/lawyer_dashboard" className="role-button">Lawyer</Link>
    </div>
  );
}

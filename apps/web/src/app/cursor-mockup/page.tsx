"use client";

export default function CursorMockupPage() {
  return (
    <div className="mockup-container">
      <h1>Cursor Options Comparison</h1>
      <p className="mockup-subtitle">Click each input to see the cursor style</p>

      <div className="mockup-options">
        {/* Option A: Underscore */}
        <div className="mockup-option">
          <h2>Option A: Underscore Cursor</h2>
          <p>Classic terminal `_` character</p>
          <div className="input-wrapper option-a">
            <label>EMAIL ADDRESS</label>
            <input type="text" placeholder="Enter your email" />
            <span className="underscore-cursor">_</span>
          </div>
        </div>

        {/* Option B: Native Orange Caret */}
        <div className="mockup-option">
          <h2>Option B: Native Orange Caret</h2>
          <p>Browser caret, orange color</p>
          <div className="input-wrapper option-b">
            <label>EMAIL ADDRESS</label>
            <input type="text" placeholder="Enter your email" className="orange-caret" />
          </div>
        </div>

        {/* Option C: Default */}
        <div className="mockup-option">
          <h2>Option C: Default Browser</h2>
          <p>Standard browser cursor</p>
          <div className="input-wrapper option-c">
            <label>EMAIL ADDRESS</label>
            <input type="text" placeholder="Enter your email" className="default-caret" />
          </div>
        </div>
      </div>

      <style>{`
        .mockup-container {
          min-height: 100vh;
          background: #0a0a0a;
          color: #e5e5e5;
          padding: 2rem;
          font-family: system-ui, sans-serif;
        }

        .mockup-container h1 {
          font-size: 1.5rem;
          margin-bottom: 0.5rem;
        }

        .mockup-subtitle {
          color: #666;
          margin-bottom: 2rem;
        }

        .mockup-options {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
        }

        .mockup-option {
          background: #1a1a1a;
          border: 1px solid #333;
          padding: 1.5rem;
        }

        .mockup-option h2 {
          font-size: 1rem;
          margin-bottom: 0.25rem;
          color: #f97316;
        }

        .mockup-option p {
          font-size: 0.875rem;
          color: #666;
          margin-bottom: 1rem;
        }

        .input-wrapper {
          position: relative;
        }

        .input-wrapper label {
          display: block;
          font-family: monospace;
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
          color: #e5e5e5;
        }

        .input-wrapper input {
          width: 100%;
          background: #0a0a0a;
          border: 1px solid #333;
          color: #e5e5e5;
          font-family: monospace;
          font-size: 0.875rem;
          padding: 0.75rem;
        }

        .input-wrapper input:focus {
          outline: none;
          border-color: #f97316;
        }

        .input-wrapper input::placeholder {
          color: #666;
        }

        /* Option A: Underscore cursor */
        .option-a input {
          caret-color: transparent;
        }

        .underscore-cursor {
          position: absolute;
          bottom: 0.75rem;
          left: 0.75rem;
          color: #f97316;
          font-family: monospace;
          font-size: 0.875rem;
          font-weight: 600;
          animation: blink 1s step-end infinite;
          pointer-events: none;
        }

        .option-a input:not(:focus) + .underscore-cursor {
          display: none;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        /* Option B: Orange caret */
        .orange-caret {
          caret-color: #f97316;
        }

        /* Option C: Default caret */
        .default-caret {
          caret-color: auto;
        }
      `}</style>
    </div>
  );
}

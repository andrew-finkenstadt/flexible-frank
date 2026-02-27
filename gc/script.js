/**
 * Gridogram Creator - Core Logic & UI
 */

class GridogramLogic {
    /**
     * Maps smart/curly quotes to standard ones and filters to printable ASCII.
     */
    static cleanInput(text) {
        return text
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[^\x20-\x7E]/g, ""); // Limit to printable ASCII
    }

    /**
     * Returns an array of word objects:
     * { display: "Don't", trace: "DONT" }
     */
    static processQuote(quote) {
        const cleaned = this.cleanInput(quote);
        const rawWords = cleaned.split(/\s+/).filter(w => w.length > 0);

        return rawWords.map(w => ({
            display: w,
            trace: w.toUpperCase().replace(/[^A-Z]/g, "")
        })).filter(w => w.trace.length > 0);
    }

    /**
     * Synchronous solver for small grids (used in tests/baseline).
     */
    static solve(processedWords, cols, rows, stochastic = true) {
        const grid = Array(rows).fill(null).map(() => Array(cols).fill(null));
        const cells = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) cells.push({ r, c });
        }

        const traceWords = processedWords.map(w => w.trace);

        const backtrack = (wIdx, cIdx, lastR, lastC, currentPathCells) => {
            if (wIdx === traceWords.length) return true;
            const word = traceWords[wIdx];
            if (cIdx === word.length) return backtrack(wIdx + 1, 0, lastR, lastC, []);

            const char = word[cIdx];
            let candidates = [];
            if (lastR === -1) candidates = [...cells];
            else {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = lastR + dr, nc = lastC + dc;
                        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) candidates.push({ r: nr, c: nc });
                    }
                }
            }
            if (stochastic) candidates.sort(() => Math.random() - 0.5);

            for (const { r, c } of candidates) {
                if (currentPathCells.some(cell => cell.r === r && cell.c === c)) continue;
                if (grid[r][c] !== null && grid[r][c] !== char) continue;
                const prevVal = grid[r][c];
                grid[r][c] = char;
                currentPathCells.push({ r, c });
                if (backtrack(wIdx, cIdx + 1, r, c, currentPathCells)) return true;
                currentPathCells.pop();
                grid[r][c] = prevVal;
            }
            return false;
        };

        return backtrack(0, 0, -1, -1, []) ? grid : null;
    }

    /**
     * Identifies traceable cells for the remainder of the quote.
     */
    static getRelevanceMap(processedWords, solvedIndices, currentPath, grid) {
        const rows = grid.length, cols = grid[0].length;
        const relevance = Array(rows).fill(null).map(() => Array(cols).fill(false));
        const last = currentPath[currentPath.length - 1];

        // If a word is being traced, only neighbors and correct letters are relevant
        for (const wordObj of processedWords) {
            // Find words that are not fully solved yet
            const isSolved = solvedIndices.has(wordObj.trace); // This is simplified; we'll need better tracking
            // For now, let's just highlight EVERYTHING that is part of an unsolved word
            // Actually, let's keep it simple: everything is relevant until solved.
        }
        return relevance; // UI will handle more specific logic
    }
}

class GridogramUI {
    constructor() {
        this.quoteInput = document.getElementById('quote-input');
        this.generateBtn = document.getElementById('generate-btn');
        this.gridContainer = document.getElementById('grid-container');
        this.statsPanel = document.getElementById('stats');
        this.solutionCount = document.getElementById('solution-count');
        this.difficultyBadge = document.getElementById('difficulty-badge');
        this.traceDisplay = document.getElementById('quote-trace');

        this.currentGrid = null;
        this.usageMap = null;
        this.processedWords = [];
        this.solvedWordIndices = new Set();
        this.path = [];

        // Inline Worker Code to bypass file:// security restrictions
        const workerCode = `
            self.onmessage = function(e) {
                const { action, data } = e.data;
                if (action === 'solve') {
                    const result = solveBoggleStyle(data.processedWords, data.cols, data.rows);
                    self.postMessage({ action: 'solveResult', result });
                }
            };

            function solveBoggleStyle(processedWords, cols, rows) {
                const startTime = Date.now();
                const timeoutMs = 200000;
                let attempts = 0;

                const words = processedWords.map((w, idx) => ({ 
                    trace: w.trace, 
                    id: idx 
                })).sort((a, b) => b.trace.length - a.trace.length);

                const maxRestarts = 500000;
                let bestPlaced = 0;
                while (attempts < maxRestarts) {
                    attempts++;
                    if (Date.now() - startTime > timeoutMs) break;

                    if (attempts % 5000 === 0) {
                        self.postMessage({ action: 'progress', data: { placed: bestPlaced, total: words.length, attempts } });
                    }

                    const grid = Array(rows).fill(null).map(() => Array(cols).fill(null));
                    const usageMap = Array(rows).fill(null).map(() => Array(cols).fill(null).map(() => []));
                    let success = true;
                    let placedCount = 0;

                    for (const { trace, id } of words) {
                        const path = findPath(trace, grid, cols, rows);
                        if (!path) { success = false; break; }
                        placedCount++;
                        path.forEach(({ r, c }, charIdx) => {
                            grid[r][c] = trace[charIdx];
                            usageMap[r][c].push({ wordId: id, charIdx });
                        });
                    }
                    if (placedCount > bestPlaced) bestPlaced = placedCount;

                    if (success) {
                        // Check for empty cells and fill them with "decoys" (duplicate words)
                        let emptyCells = [];
                        for (let r = 0; r < rows; r++) {
                            for (let c = 0; c < cols; c++) if (!grid[r][c]) emptyCells.push({ r, c });
                        }

                        if (emptyCells.length > 0) {
                           // Try to fill empty cells by repeating random words until full
                           let fillAttempts = 0;
                           while (emptyCells.length > 0 && fillAttempts < 50) {
                               fillAttempts++;
                               const targetWord = words[Math.floor(Math.random() * words.length)];
                               const path = findPath(targetWord.trace, grid, cols, rows, true); // true = allow overlap
                               if (path) {
                                   path.forEach(({ r, c }, charIdx) => {
                                       grid[r][c] = targetWord.trace[charIdx];
                                       usageMap[r][c].push({ wordId: targetWord.id, charIdx });
                                   });
                                   emptyCells = [];
                                   for (let r = 0; r < rows; r++) {
                                       for (let c = 0; c < cols; c++) if (!grid[r][c]) emptyCells.push({ r, c });
                                   }
                               }
                           }
                        }

                        if (emptyCells.length === 0) {
                            return { grid, usageMap, attempts, timeTaken: (Date.now() - startTime) / 1000 };
                        }
                    }
                }
                return { grid: null, attempts };
            }

            function findPath(word, grid, cols, rows, allowOverlap = true) {
                const cells = [];
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) cells.push({ r, c });
                }
                cells.sort(() => Math.random() - 0.5);

                for (const start of cells) {
                    if (!allowOverlap && grid[start.r][start.c]) continue;
                    if (grid[start.r][start.c] && grid[start.r][start.c] !== word[0]) continue;

                    const path = backtrack(word, 0, start.r, start.c, grid, cols, rows, []);
                    if (path) return path;
                }
                return null;
            }

            function backtrack(word, charIdx, r, c, grid, cols, rows, path) {
                if (charIdx === word.length) return path;
                if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
                if (grid[r][c] && grid[r][c] !== word[charIdx]) return null;
                if (path.some(p => p.r === r && p.c === c)) return null;

                const newPath = [...path, { r, c }];
                if (charIdx === word.length - 1) return newPath;

                const neighbors = [];
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        neighbors.push({ r: r + dr, c: c + dc });
                    }
                }
                neighbors.sort(() => Math.random() - 0.5);

                for (const n of neighbors) {
                    const res = backtrack(word, charIdx + 1, n.r, n.c, grid, cols, rows, newPath);
                    if (res) return res;
                }
                return null;
            }
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        this.worker.addEventListener('message', (e) => this.handleWorkerMessage(e));
        this.init();
    }

    init() {
        this.generateBtn?.addEventListener('click', () => this.generate());
        document.getElementById('run-tests-btn')?.addEventListener('click', () => this.runTests());
        document.getElementById('close-tests-btn')?.addEventListener('click', () => {
            document.getElementById('test-dashboard')?.classList.add('hidden');
        });
    }

    handleWorkerMessage(e) {
        const { action, result, data } = e.data;
        if (action === 'progress') {
            const percent = Math.floor((data.placed / data.total) * 100);
            const total = this.cumulativeAttempts + data.attempts;
            this.solutionCount.textContent = `Attempt ${total.toLocaleString()} (${percent}%)`;
        } else if (action === 'solveResult') {
            this.handleSolveResult(result);
        }
    }

    generate() {
        const quote = this.quoteInput.value.trim();
        if (!quote) return;

        this.processedWords = GridogramLogic.processQuote(quote);
        if (this.processedWords.length === 0) return;

        this.uniqueLetters = new Set(this.processedWords.map(w => w.trace).join("")).size;
        this.generateBtn.disabled = true;
        this.generateBtn.textContent = "Solving...";
        this.solutionCount.textContent = "Solving... 0%";
        this.statsPanel.classList.remove('hidden');
        this.totalStartTime = Date.now();
        this.cumulativeAttempts = 0;

        this.gridTiers = [
            { c: 4, r: 3 }, // 3x4 (12 letters)
            { c: 4, r: 4 }, // 4x4 (16 letters)
            { c: 5, r: 4 }, // 5x4 (20 letters)
            { c: 5, r: 5 }, // 5x5 (25 letters)
            { c: 6, r: 5 }, // 5x6 (30 letters)
            { c: 6, r: 6 }, // 6x6 (36 letters)
            { c: 7, r: 6 }, // 7x6 (42 letters)
            { c: 7, r: 7 }  // 7x7 (49 letters)
        ];
        this.tierIdx = 0;
        this.attemptNextTier();
    }

    attemptNextTier() {
        if (this.tierIdx >= this.gridTiers.length) {
            alert("This quote is too long or complex even for a 7x7 grid. Please try a shorter quote.");
            this.resetButton();
            return;
        }

        const tier = this.gridTiers[this.tierIdx];
        if (tier.c * tier.r < this.uniqueLetters) {
            this.tierIdx++;
            this.attemptNextTier();
            return;
        }

        this.worker.postMessage({
            action: 'solve',
            data: { processedWords: this.processedWords, cols: tier.c, rows: tier.r }
        });
    }

    handleSolveResult(result) {
        if (result) {
            this.cumulativeAttempts += result.attempts;
        }

        if (result && result.grid) {
            this.currentGrid = result.grid;
            this.usageMap = result.usageMap;
            this.solvedWordIndices.clear();
            this.resetTracing();
            this.renderGrid(this.currentGrid);
            this.difficultyBadge.textContent = this.uniqueLetters < 10 ? "Easy" : this.uniqueLetters < 18 ? "Medium" : "Hard";

            const totalTime = ((Date.now() - this.totalStartTime) / 1000).toFixed(2);
            const iterStr = this.cumulativeAttempts.toLocaleString();

            this.solutionCount.textContent = `Solved in ${totalTime}s | ${iterStr} attempts`;

            this.updateTraceDisplay();
            this.updateRelevance();
            this.resetButton();
        } else {
            this.tierIdx++;
            this.attemptNextTier();
        }
    }

    resetButton() {
        this.generateBtn.disabled = false;
        this.generateBtn.textContent = "Generate Grid";
    }

    resetTracing() {
        this.path = [];
        this.gridContainer.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('highlight'));
    }

    renderGrid(grid) {
        this.gridContainer.innerHTML = '';
        const rows = grid.length, cols = grid[0].length;
        this.gridContainer.style.gridTemplateColumns = `repeat(${cols}, 60px)`;

        grid.forEach((row, r) => {
            row.forEach((letter, c) => {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.textContent = letter;
                cell.dataset.r = r;
                cell.dataset.c = c;
                cell.addEventListener('click', () => this.handleCellClick(r, c, cell));
                this.gridContainer.appendChild(cell);
            });
        });
    }

    handleCellClick(r, c, element) {
        const last = this.path[this.path.length - 1];
        if (last) {
            const distR = Math.abs(r - last.r);
            const distC = Math.abs(c - last.c);
            if (distR > 1 || distC > 1 || (distR === 0 && distC === 0)) {
                this.resetTracing();
                // Don't return, allow starting a new path from here
            }
        }

        if (this.path.some(p => p.r === r && p.c === c)) {
            // Clicking a used cell in current path: backtrack to here
            const idx = this.path.findIndex(p => p.r === r && p.c === c);
            this.path.slice(idx + 1).forEach(p => {
                this.gridContainer.querySelector(`[data-r="${p.r}"][data-c="${p.c}"]`).classList.remove('highlight');
            });
            this.path = this.path.slice(0, idx + 1);
            return;
        }

        this.path.push({ r, c });
        element.classList.add('highlight');

        const currentString = this.path.map(p => this.currentGrid[p.r][p.c]).join("");

        // Find if any word matches
        let foundMatch = false;
        this.processedWords.forEach((wordObj, idx) => {
            if (wordObj.trace === currentString && !this.solvedWordIndices.has(idx)) {
                this.solvedWordIndices.add(idx);
                foundMatch = true;
            }
        });

        if (foundMatch) {
            this.resetTracing();
            this.updateTraceDisplay();
            this.updateRelevance();

            if (this.solvedWordIndices.size === this.processedWords.length) {
                setTimeout(() => alert("Congratulations! Quote complete."), 100);
            }
        }
    }

    updateTraceDisplay() {
        let display = "";
        this.processedWords.forEach((wordObj, idx) => {
            if (this.solvedWordIndices.has(idx)) {
                display += `<span class="completed">${wordObj.display}</span> `;
            } else {
                display += wordObj.display.replace(/[A-Za-z]/g, "_") + " ";
            }
        });
        this.traceDisplay.innerHTML = display;
    }

    updateRelevance() {
        const rows = this.currentGrid.length, cols = this.currentGrid[0].length;
        this.gridContainer.querySelectorAll('.grid-cell').forEach(cell => {
            const r = parseInt(cell.dataset.r);
            const c = parseInt(cell.dataset.c);

            // A cell is bright if ANY of its words are NOT solved
            const wordInfos = this.usageMap[r][c];
            const isRelevant = wordInfos.some(info => !this.solvedWordIndices.has(info.wordId));

            if (isRelevant) cell.classList.remove('dimmed');
            else cell.classList.add('dimmed');
        });
    }

    runTests() {
        const dashboard = document.getElementById('test-dashboard');
        const results = document.getElementById('test-results');
        if (!dashboard || !results) return;

        dashboard.classList.remove('hidden');
        results.innerHTML = '<div class="test-item"><span>Running Diagnostic Suite...</span></div>';

        const addResult = (msg, pass) => {
            const div = document.createElement('div');
            div.className = `test-item ${pass ? 'test-pass' : 'test-fail'}`;
            div.innerHTML = `<span>${msg}</span><span>${pass ? '✓' : '✗'}</span>`;
            results.appendChild(div);
        };

        try {
            const processed = GridogramLogic.processQuote("Don't stop!");
            addResult("Punctuation Handling", processed[0].display === "Don't" && processed[0].trace === "DONT");
            addResult("Smart Quote Mapping", GridogramLogic.cleanInput("\u201CHello\u201D") === '"Hello"');
            addResult("ASCII Constraint", GridogramLogic.cleanInput("Caf\u00e9") === "Caf");
            addResult("Sync Solver Baseline", !!GridogramLogic.solve(processed, 4, 4, false));
        } catch (err) {
            addResult("Core Logic Exception: " + err.message, false);
        }
    }
}

window.addEventListener('load', () => {
    window.ui = new GridogramUI();
});

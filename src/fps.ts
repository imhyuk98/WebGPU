export class FPSCounter {
    private frameCount: number = 0;
    private lastTime: number = 0;
    private fps: number = 0;
    private element: HTMLElement;
    private frameTimes: number[] = [];
    private maxSamples: number = 60;

    constructor() {
        this.element = document.createElement('div');
        this.element.style.cssText = `
            position: fixed;
            top: auto;
            bottom: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            font-family: monospace;
            font-size: 12px;
            font-weight: bold;
            padding: 8px 12px;
            border-radius: 4px;
            z-index: 1000;
            user-select: none;
            pointer-events: none;
            line-height: 1.3;
        `;
        
        document.body.appendChild(this.element);
        this.updateDisplay();
        this.lastTime = performance.now();
    }

    update(currentTime: number) {
        // 프레임 시간 계산
        if (this.lastTime > 0) {
            const frameTime = currentTime - this.lastTime;
            this.frameTimes.push(frameTime);
            
            if (this.frameTimes.length > this.maxSamples) {
                this.frameTimes.shift();
            }
        }
        
        this.lastTime = currentTime;
        this.frameCount++;

        // 매 30프레임마다 업데이트
        if (this.frameCount % 30 === 0 && this.frameTimes.length > 10) {
            this.calculateFPS();
            this.updateDisplay();
        }
    }

    private calculateFPS() {
        if (this.frameTimes.length > 0) {
            const avgFrameTime = this.frameTimes.reduce((sum, time) => sum + time, 0) / this.frameTimes.length;
            this.fps = Math.round(1000 / avgFrameTime);
        }

        // 비정상적인 값 제한
        if (this.fps > 1000) this.fps = 1000;
        if (this.fps < 0) this.fps = 0;
    }

    private updateDisplay() {
        const color = this.getFPSColor(this.fps);
        this.element.style.color = color;
        
        const avgFrameTime = this.frameTimes.length > 0 
            ? (this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length).toFixed(1)
            : '0.0';
            
        this.element.innerHTML = `
            <div style="color: ${color};">FPS: ${this.fps}</div>
            <div style="font-size: 10px; opacity: 0.7;">Frame: ${avgFrameTime}ms</div>
            <div style="font-size: 9px; opacity: 0.5;">${this.isVSyncLimited() ? 'VSync ON' : 'VSync OFF'}</div>
            <div style="font-size: 9px; opacity: 0.5;">WebGPU Ray Tracing</div>
        `;
    }

    private isVSyncLimited(): boolean {
        if (this.frameTimes.length < 30) return false;
        
        const avgTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        const variance = this.frameTimes.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / this.frameTimes.length;
        const stdDev = Math.sqrt(variance);
        
        return stdDev < 0.5;
    }

    private getFPSColor(fps: number): string {
        if (fps >= 120) return '#00ff00';     // 초록
        if (fps >= 60) return '#80ff00';      // 연두
        if (fps >= 30) return '#ffff00';      // 노랑
        if (fps >= 15) return '#ff8800';      // 주황
        return '#ff0000';                     // 빨강
    }

    getCurrentFPS(): number {
        return this.fps;
    }

    getDebugInfo() {
        return {
            fps: this.fps,
            samples: this.frameTimes.length,
            avgFrameTime: this.frameTimes.length > 0 
                ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length 
                : 0,
            isVSyncLimited: this.isVSyncLimited()
        };
    }
}


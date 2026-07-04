import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

const MAX_BUFFERED_LINES = 500;

/**
 * Manages the single generated-server child process for this editor-server instance.
 * This is a single-project-per-process tool (see AppConfig), so a module-level
 * singleton is correct here — there is never more than one "current" server to run.
 */
class ServerRunner extends EventEmitter {
  private child: ChildProcess | null = null;
  private logBuffer: string[] = [];

  get running(): boolean {
    return this.child !== null;
  }

  /**
   * Stops any existing process and waits for it to actually exit before spawning the
   * new one — starting immediately after `kill()` (without waiting) races the old
   * process's port release against the new process's bind, crashing the new one with
   * EADDRINUSE.
   */
  async start(projectDir: string, serverPath: string): Promise<void> {
    await this.stop();
    this.logBuffer = [];

    const child = spawn(process.execPath, [serverPath], {
      cwd: projectDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;

    const onData = (chunk: Buffer) => {
      const line = chunk.toString();
      this.logBuffer.push(line);
      if (this.logBuffer.length > MAX_BUFFERED_LINES) this.logBuffer.shift();
      this.emit("log", line);
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      // Fires asynchronously — by then `start()` may already have replaced `this.child`
      // with a newer process. Only clear the reference if it's still this exact child,
      // or a restart's new process gets wiped out from under it.
      if (this.child === child) this.child = null;
      this.emit("exit", code);
    });
    child.on("error", (err) => {
      onData(Buffer.from(`Failed to start server: ${err.message}\n`));
    });
  }

  /** Kills the current process (if any) and resolves once it has actually exited. */
  stop(): Promise<void> {
    const child = this.child;
    if (!child) return Promise.resolve();

    return new Promise((resolve) => {
      child.once("exit", () => resolve());
      child.kill();
    });
  }

  getBufferedLogs(): string[] {
    return this.logBuffer;
  }
}

export const serverRunner = new ServerRunner();

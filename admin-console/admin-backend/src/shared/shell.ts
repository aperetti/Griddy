import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface ShellResult {
  stdout: string;
  stderr: string;
}

/**
 * Securely executes a command using execFile (no shell).
 * @param executable Path to the executable
 * @param args Array of arguments
 * @param cwd Working directory
 */
export async function runCommand(executable: string, args: string[] = [], cwd: string = process.cwd()): Promise<ShellResult> {
  console.log(`Executing: ${executable} ${args.join(' ')} in ${cwd}`);
  try {
    const { stdout, stderr } = await execFileAsync(executable, args, { cwd });
    return { stdout, stderr };
  } catch (error: any) {
    console.error(`Command failed: ${executable}`, error);
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message
    };
  }
}

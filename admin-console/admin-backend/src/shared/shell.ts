import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ShellResult {
  stdout: string;
  stderr: string;
}

export async function runCommand(command: string, cwd: string = process.cwd()): Promise<ShellResult> {
  console.log(`Executing: ${command} in ${cwd}`);
  try {
    const { stdout, stderr } = await execAsync(command, { cwd });
    return { stdout, stderr };
  } catch (error: any) {
    console.error(`Command failed: ${command}`, error);
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message
    };
  }
}

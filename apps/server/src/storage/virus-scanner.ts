export interface AntivirusScanner {
  scan(path: string): Promise<'clean' | 'infected'>;
}

/**
 * Extension point for ClamAV or another scanner. The MVP validates signatures and
 * enforces a strict allow-list, but does not claim malware detection.
 */
export class SignatureOnlyScanner implements AntivirusScanner {
  scan(_path: string): Promise<'clean'> {
    return Promise.resolve('clean');
  }
}

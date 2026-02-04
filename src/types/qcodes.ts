export interface QCode {
  id: string;
  code: string;
  meaning: string;
  meaningEnglish: string;
  hint: string;
}

export interface QCodeBank {
  qCodes: QCode[];
  metadata: {
    source: string;
    totalCodes: number;
  };
}

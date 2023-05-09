export const splitToChunks = <T>(array: T[], chunkSize: number): T[][] => {
  const result: T[][] = [];

  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }

  return result;
};

export const splitToAirtableChunks = <T>(array: T[]): T[][] => {
  return splitToChunks(array, 10);
};

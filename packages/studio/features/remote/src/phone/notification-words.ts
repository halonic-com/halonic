/** The words of the phone's notifications (HAL-17514 `wording`, p06c; Noah's choice on HAL-19249). */
export const phoneNotificationWords = {
  /** p06c: the same line for every item, with the computer's name as stored at pairing. */
  lockScreen: (computer: string) => `Something needs you on ${computer}`,
} as const;

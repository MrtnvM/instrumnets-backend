import { IsBoolean, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class OderItemDto {
  @IsString()
  @IsNotEmpty()
  productCode: string;

  @IsNumber()
  @IsNotEmpty()
  count: number;

  @IsBoolean()
  @IsNotEmpty()
  isConsumable: boolean;
}

import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class OderItemDto {
  @IsString()
  @IsNotEmpty()
  productCode: string;

  @IsNumber()
  @IsNotEmpty()
  count: number;
}

import {
  ArrayNotEmpty,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { OderItemDto } from './order-item.dto';

export class OrderDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  company: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  comment: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['Казань'])
  city: string;

  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  orderItems: OderItemDto[];
}

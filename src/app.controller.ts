import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AppService } from './app.service';
import { OrderDto } from './models/order.dto';
import { FirebaseAuthGuard } from './core/providers/firebase-auth.guard';
import { FirebaseUserRequest } from './core/providers/firebase-user.request';
import { ProductsService } from './data/products.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private productsService: ProductsService,
  ) {}

  @Get('products')
  getProducts(@Query('email') email: string) {
    const clientEmail = email || null;
    return this.productsService.getCachedProducts(clientEmail);
  }

  @Get('v2/products')
  getAllProducts(@Query('email') email: string) {
    const clientEmail = email || null;
    return this.appService.getCachedAllProducts(clientEmail);
  }

  @Post('order/create')
  @UseGuards(new FirebaseAuthGuard())
  createOrder(@Body() order: OrderDto, @Req() request: FirebaseUserRequest) {
    return this.appService.createOrder(order, request.email);
  }

  @Get('orders')
  @UseGuards(new FirebaseAuthGuard())
  getOrders(@Req() request: FirebaseUserRequest) {
    return this.appService.getOrders(request.profileId);
  }
}

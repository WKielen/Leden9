import { Component, OnInit, ViewChild } from '@angular/core';
import { LedenService, LedenItem, DateRoutines, LedenItemExt } from './../../services/leden.service';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource, MatTable } from '@angular/material/table';
import { LedenDeleteDialogComponent } from '../ledenmanager/ledendelete.dialog';
import { AppError } from '../../shared/error-handling/app-error';
import { DuplicateKeyError } from '../../shared/error-handling/duplicate-key-error';
import { NotFoundError } from '../../shared/error-handling/not-found-error';
import { LedenDialogComponent } from './ledenmanager.dialog';
import { SnackbarTexts } from 'src/app/shared/error-handling/SnackbarTexts';
import { ParentComponent } from 'src/app/shared/components/parent.component';
import { SingleMailDialogComponent, SingleMail } from '../mail/singlemail.dialog';
import { NoChangesMadeError } from 'src/app/shared/error-handling/no-changes-made-error';
import { NotificationService } from 'src/app/services/notification.service';
import { ROLES } from 'src/app/shared/classes/Page-Role-Variables';

@Component({
    selector: 'app-leden',
    templateUrl: './ledenmanager.component.html',
    styleUrls: ['./ledenmanager.component.scss'],
})

export class LedenManagerComponent extends ParentComponent implements OnInit {

    @ViewChild(MatTable, { static: false }) table: MatTable<any>;

    columnsToDisplay: string[] = ['Naam', 'Leeftijd', 'actions2'];
    dataSource = new MatTableDataSource<LedenItem>();

    constructor(private ledenService: LedenService,
        protected notificationService: NotificationService,
        protected snackBar: MatSnackBar,
        public dialog: MatDialog) {
        super(snackBar)
    }

    ngOnInit(): void {
        this.registerSubscription(
            this.ledenService.getActiveMembers$(true)
                .subscribe((data: Array<LedenItem>) => {
                    this.dataSource.data = data;
                }));
    }



    /***************************************************************************************************
    / Er gaat een nieuw lid worden opgevoerd. We halen eerst een nieuw lidnummer op.
    /***************************************************************************************************/
    async onAdd(): Promise<void> {
        // Hier wordt de call SYNC uitgevoerd!!!!
        // -------------------------------------------------------- :o)
        const tmpJson = await this.ledenService.getNewLidnr$()
            .toPromise()
            .then(response => response as string);
        // -------------------------------------------------------- :o)

        const toBeAdded = new LedenItem();
        toBeAdded.LidVanaf = new Date().to_YYYY_MM_DD();
        toBeAdded.LidNr = Number(tmpJson['maxlidnr']) + 1;
        toBeAdded.LidType = 'N';  // default lidtype
        toBeAdded.BetaalWijze = 'I';  // defualt betaalwijze Incasso

        // let tmp;
        this.dialog.open(LedenDialogComponent, {
            panelClass: 'custom-dialog-container', width: '600px',
            data: { 'method': 'Toevoegen', 'data': toBeAdded },  
            disableClose: true
        })
            .afterClosed()  // returns an observable
            .subscribe(result => {
                if (result) {  // in case of cancel the result will be false
                    let sub = this.ledenService.create$(result)
                        .subscribe(addResult => {
                            result.Naam = LedenItem.getFullNameAkCt(result.Voornaam, result.Tussenvoegsel, result.Achternaam);
                            result.LeeftijdCategorieBond = DateRoutines.LeeftijdCategorieBond(result.GeboorteDatum);
                            result.Leeftijd = DateRoutines.Age(result.GeboorteDatum);


                            result.VolledigeNaam = LedenItem.getFullNameVtA(result.Voornaam, result.Tussenvoegsel, result.Achternaam);

                            this.dataSource.data.unshift(result);

                            this.refreshTableLayout();
                            this.showSnackBar(SnackbarTexts.SuccessNewRecord);

                            let message = "Nieuw lid: " + result.VolledigeNaam + " , " + result.Leeftijd + " jaar"
                            this.notificationService.sendNotificationsForRole([ROLES.BESTUUR], "Ledenadministrate", message);

                            if (LedenItem.GetEmailList(toBeAdded).length > 0) {
                                this.showMailDialog(toBeAdded, 'add');
                            }
                        },
                            (error: AppError) => {
                                if (error instanceof DuplicateKeyError) {
                                    this.showSnackBar(SnackbarTexts.DuplicateKey);
                                } else { throw error; }
                            }
                        );
                    this.registerSubscription(sub);
                }
            });
    }

    /***************************************************************************************************
    / 
    /***************************************************************************************************/
    onDelete(index: number): void {
        let toBeDeleted: LedenItem = this.dataSource.data[index];

        toBeDeleted.LidTot = new Date().to_YYYY_MM_DD();
        const dialogRef = this.dialog.open(LedenDeleteDialogComponent, {
            panelClass: 'custom-dialog-container', width: '300px',
            data: { 'method': 'Opzeggen', 'data': toBeDeleted },  
            disableClose: true 
        });

        dialogRef.afterClosed().subscribe((result: LedenItem) => {
            // console.log('received in OnEdit from dialog', result);
            if (result) {  // in case of cancel the result will be false
                console.log('toBeDeleted', toBeDeleted);

                toBeDeleted.LidTot = result.LidTot;
                const updateRecord = { 'LidNr': result.LidNr, 'Opgezegd': '1', 'LidTot': result.LidTot };
                let sub = this.ledenService.update$(updateRecord)
                    .subscribe(data => {
                        this.dataSource.data.splice(index, 1);
                        this.refreshTableLayout();
                        this.showSnackBar('Jammer, dat dit lid heeft opgezegd');

                        let message = "Lid Opgezegd: " + LedenItem.getFullNameVtA(toBeDeleted.Voornaam, toBeDeleted.Tussenvoegsel, toBeDeleted.Achternaam);
                        this.notificationService.sendNotificationsForRole([ROLES.BESTUUR], "Ledenadministrate", message);

                        if (LedenItem.GetEmailList(toBeDeleted).length > 0) {
                            this.showMailDialog(toBeDeleted, 'delete');
                        }
                    },
                        (error: AppError) => {
                            if (error instanceof NotFoundError) {
                                this.showSnackBar(SnackbarTexts.NotFound);
                            }
                            this.showSnackBar(SnackbarTexts.NoChanges);
                        });
                this.registerSubscription(sub);
            }
        });
    }

    /***************************************************************************************************
    / 
    /***************************************************************************************************/
    onEdit(index: number): void {
        let toBeEdited: LedenItem = this.dataSource.data[index];

        const dialogRef = this.dialog.open(LedenDialogComponent, {
            panelClass: 'custom-dialog-container', width: '600px', 
            data: { 'method': 'Wijzigen', 'data': toBeEdited },  
            disableClose: true
        });

        dialogRef.afterClosed().subscribe((result: LedenItemExt) => {
            // console.log('received in OnEdit from dialog');
            if (result) {  // in case of cancel the result will be false
                let sub = this.ledenService.update$(result)
                    .subscribe(data => {
                        result.Naam = LedenItem.getFullNameAkCt(result.Voornaam, result.Tussenvoegsel, result.Achternaam);
                        result.LeeftijdCategorieBond = DateRoutines.LeeftijdCategorieBond(result.GeboorteDatum);
                        // this.dataSource.data.unshift(result);

                        this.refreshTableLayout();



                        this.showSnackBar(SnackbarTexts.SuccessFulSaved);
                    },
                        (error: AppError) => {
                            if (error instanceof NoChangesMadeError) {
                                this.showSnackBar(SnackbarTexts.NoChanges);
                            } else { throw error; }
                        });
                this.registerSubscription(sub);
            }
        });
    }

    /***************************************************************************************************
    / Na het toevoegen of verwijderen van een lid wordt de mail dialoog getoond zodat er een bevestiging
    / verstuurd kan worden.
    /***************************************************************************************************/
    showMailDialog(lid: LedenItem, action: string): void {
        let data = new SingleMail();
        switch (action) {
            case 'add':
                data.TemplatePathandName = 'templates/template_aanmelding.html';
                data.Subject = "Aanmelding als nieuw lid bij TTVN";
                break;
            case 'delete':
                data.TemplatePathandName = 'templates/template_opzegging.html';
                data.Subject = "Opzegging lidmaatschap TTVN";
                break;
        }

        data.Lid = lid;

        this.dialog.open(SingleMailDialogComponent, {
            panelClass: 'custom-dialog-container', width: '800px',
            data: data,  
            disableClose: true
        })
    }

    /***************************************************************************************************
    / 
    /***************************************************************************************************/
    private refreshTableLayout(): void {
        this.dataSource.data.sort((item1, item2) => {
            return (item1.Achternaam.toString().localeCompare(item2.Achternaam.toString(), undefined, { numeric: false }));
        });
        this.table.renderRows();
    }

    /***************************************************************************************************
    / The onRowClick from a row that has been hit
    /***************************************************************************************************/
    onDblclick($event, index): void {
        this.onEdit(index);
    }
}
